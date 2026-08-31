const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const AgentMandateStandard = require('./src/standards/ams');
const mandateStore = new Map();
const {
  approveAction,
  approveAllQueued,
  createAgent,
  createActionRequest,
  createSdkPreflight,
  createTwinStore,
  denyAction,
  denyAllQueued,
  exportJournal,
  getFilteredState,
  getBootstrap,
  lockSession,
  listPresets,
  runDemoScenario,
  setActiveProfile,
  setActiveWorkspace,
  unlockSession,
  updatePolicy,
  updateRiskRules,
  createZkProof,
  verifyZkProof
} = require("./src/core.js");

const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

async function handleApi(store, request, response) {
  const url = new URL(request.url, "http://localhost");

  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    return sendJson(response, 200, {
      ...getBootstrap(store),
      presets: listPresets(),
    });
  }

  if (request.method === "POST" && url.pathname === "/api/session/unlock") {
    const body = await readJson(request);
    return sendJson(response, 200, unlockSession(store, body.pin));
  }

  if (request.method === "POST" && url.pathname === "/api/session/lock") {
    return sendJson(response, 200, lockSession(store));
  }

  if (request.method === "POST" && url.pathname === "/api/actions") {
    const body = await readJson(request);
    const action = createActionRequest(store, body);
    return sendJson(response, 201, action);
  }

  if (request.method === "POST" && url.pathname === "/api/sdk/preflight") {
    const body = await readJson(request);
    const token = request.headers["x-agent-token"];
    const result = createSdkPreflight(store, body, token);
    // CORRECTION AUDIT (probleme important #3) : on relaie desormais le statut renvoye
    // par createSdkPreflight (401 si agent/token invalide) au lieu de renvoyer 201 a tout coup.
    return sendJson(response, result.status || 201, result);
  }

  if (request.method === "POST" && url.pathname === "/api/sdk/proof") {
    const body = await readJson(request);
    const token = request.headers["x-agent-token"];
    if (!token) return sendJson(response, 401, { error: 'Header x-agent-token requis' });
    
    const action = body.action || body;
    if (!action.type && !action.merchant) {
        return sendJson(response, 400, { error: 'Action doit contenir au moins "merchant" et "amount"' });
    }
    const result = await createZkProof(store, token, action);
    return sendJson(response, result.status || 200, result);
  }

  if (request.method === "POST" && url.pathname === "/api/sdk/verify-proof") {
    const body = await readJson(request);
    const result = await verifyZkProof(store, body);
    return sendJson(response, result.status || 200, result);
  }

  if (url.pathname.startsWith("/api/sdk/mandate")) {
    if (request.method === "POST" && url.pathname === "/api/sdk/mandate/create") {
        const body = await readJson(request);
        const { principal, agent, permissions, expiresAt, metadata } = body;
        if (!principal || !agent || !permissions) {
            return sendJson(response, 400, { error: 'principal, agent et permissions sont requis' });
        }
        const mandate = AgentMandateStandard.createMandate({ principal, agent, permissions, expiresAt, metadata });
        const validation = AgentMandateStandard.validate(mandate);
        if (!validation.valid) {
            return sendJson(response, 400, { error: 'Mandat invalide', details: validation.errors });
        }
        mandateStore.set(mandate.id, mandate);
        return sendJson(response, 201, {
            message: '✅ Mandat AMS créé',
            mandate: mandate,
            next_steps: {
                // CORRECTION AUDIT (probleme important #7) : "sign" a ete retire, cet
                // endpoint n'existe pas dans le routeur (404 confirme lors de l'audit).
                verify: `POST /api/sdk/mandate/verify`,
                export: `GET /api/sdk/mandate/${mandate.id}`
            }
        });
    }
    
    if (request.method === "GET" && url.pathname === "/api/sdk/mandate/spec") {
        return sendJson(response, 200, {
            name: 'Agent Mandate Standard',
            version: '0.1.0',
            context: 'https://permission-twin.org/ams/v0.1',
            description: 'Format standard pour les mandats d\'agents IA autonomes',
            fields: {
                '@context': 'URL du contexte (toujours https://permission-twin.org/ams/v0.1)',
                'type': 'Toujours "AgentMandate"',
                'version': 'Version du standard (0.1.0)',
                'id': 'Identifiant unique du mandat',
                'issuedAt': 'Date d\'émission (ISO 8601)',
                'principal': 'Qui autorise (humain ou organisation)',
                'agent': 'L\'agent autorisé',
                'permissions': 'Liste des permissions avec contraintes',
                'expiresAt': 'Date d\'expiration (optionnel)',
                'metadata': 'Métadonnées additionnelles (optionnel)',
                'signature': 'Signature cryptographique (optionnel)',
                'proof': 'Preuve ZK associée (optionnel)'
            },
            example: {
                '@context': 'https://permission-twin.org/ams/v0.1',
                'type': 'AgentMandate',
                'version': '0.1.0',
                'id': 'ams:abc123def456',
                'issuedAt': '2026-08-29T23:00:00.000Z',
                'principal': { type: 'human', id: 'did:example:alice', name: 'Alice' },
                'agent': { type: 'ai-agent', id: 'agent-researcher-01', name: 'Research Agent' },
                'permissions': [
                    { action: 'purchase', constraints: { maxAmount: 1000, currency: 'USD', allowedMerchants: ['AWS', 'Google Cloud'] } },
                    { action: 'research', constraints: {} }
                ],
                'expiresAt': '2026-12-31T23:59:59.000Z'
            }
        });
    }

    if (request.method === "POST" && url.pathname === "/api/sdk/mandate/verify") {
        const body = await readJson(request);
        const { mandate, publicKey } = body;
        if (!mandate) return sendJson(response, 400, { error: 'Mandat requis' });
        const validation = AgentMandateStandard.validate(mandate);
        let signatureResult = null;
        if (publicKey && mandate.signature) {
            signatureResult = AgentMandateStandard.verifySignature(mandate, publicKey);
        }
        return sendJson(response, 200, {
            valid: validation.valid && (!signatureResult || signatureResult.valid),
            structure: validation,
            signature: signatureResult,
            mandate: mandate
        });
    }

    if (request.method === "GET" && url.pathname === "/api/sdk/mandates") {
        const mandates = Array.from(mandateStore.values());
        return sendJson(response, 200, { count: mandates.length, mandates: mandates });
    }

    const parts = url.pathname.split('/');
    if (parts.length === 5 && request.method === "GET") {
        const id = parts[4];
        const mandate = mandateStore.get(id);
        if (!mandate) return sendJson(response, 404, { error: 'Mandat non trouvé' });
        return sendJson(response, 200, mandate);
    }

    if (parts.length === 6 && parts[5] === 'authorize' && request.method === "POST") {
        const id = parts[4];
        const mandate = mandateStore.get(id);
        if (!mandate) return sendJson(response, 404, { error: 'Mandat non trouvé' });
        
        const body = await readJson(request);
        const action = body.action;
        if (!action) return sendJson(response, 400, { error: 'Action requise' });
        
        const result = AgentMandateStandard.authorizeAction(mandate, action);
        return sendJson(response, 200, { mandateId: mandate.id, action: action, ...result });
    }
  }

  if (request.method === "GET" && url.pathname === "/api/agents") {
    return sendJson(response, 200, {
      agents: getBootstrap(store).agents,
    });
  }

  if (request.method === "POST" && url.pathname === "/api/agents") {
    const body = await readJson(request);
    return sendJson(response, 201, createAgent(store, body));
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/actions/") && url.pathname.endsWith("/approve")) {
    const id = url.pathname.split("/")[3];
    const action = approveAction(store, id);
    return sendJson(response, 200, action);
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/actions/") && url.pathname.endsWith("/deny")) {
    const id = url.pathname.split("/")[3];
    const body = await readJson(request);
    const action = denyAction(store, id, body.reason || "Denied by user.");
    return sendJson(response, 200, action);
  }

  if (request.method === "GET" && url.pathname === "/api/state") {
    return sendJson(
      response,
      200,
      getFilteredState(store, {
        query: url.searchParams.get("query"),
        status: url.searchParams.get("status"),
        memoryKind: url.searchParams.get("memoryKind"),
      })
    );
  }

  if (request.method === "POST" && url.pathname === "/api/policy") {
    const body = await readJson(request);
    return sendJson(response, 200, {
      policy: updatePolicy(store, body),
    });
  }

  if (request.method === "POST" && url.pathname === "/api/profile") {
    const body = await readJson(request);
    return sendJson(response, 200, setActiveProfile(store, body.profileId));
  }

  if (request.method === "POST" && url.pathname === "/api/workspace") {
    const body = await readJson(request);
    return sendJson(response, 200, setActiveWorkspace(store, body.workspaceId));
  }

  if (request.method === "GET" && url.pathname === "/api/export") {
    return sendJson(response, 200, exportJournal(store));
  }

  if (request.method === "POST" && url.pathname === "/api/risk-rules") {
    const body = await readJson(request);
    return sendJson(response, 200, {
      riskRules: updateRiskRules(store, body),
    });
  }

  if (request.method === "POST" && url.pathname === "/api/demo/run") {
    const body = await readJson(request);
    return sendJson(response, 200, runDemoScenario(store, body.scenarioId));
  }

  if (request.method === "POST" && url.pathname === "/api/queue/approve-all") {
    return sendJson(response, 200, approveAllQueued(store));
  }

  if (request.method === "POST" && url.pathname === "/api/queue/deny-all") {
    const body = await readJson(request);
    return sendJson(response, 200, denyAllQueued(store, body.reason || "Denied from queue.")); 
  }

  return sendJson(response, 404, { error: "Route introuvable." });
}

async function handleRequest(request, response) {
  try {
    if ((request.url || "").startsWith("/api/")) {
      return await handleApi(this.store, request, response);
    }

    return serveStatic(request, response);
  } catch (error) {
    if (error.message === 'PAYLOAD_TOO_LARGE') {
      return sendJson(response, 413, { error: 'Payload too large (max 1MB)' });
    }
    return sendJson(response, 400, { error: error.message || "Erreur serveur." });
  }
}

function serveStatic(request, response) {
  const url = new URL(request.url, "http://localhost");
  const relativePath = url.pathname === "/" ? "/index.html" : url.pathname;
  const absolutePath = path.join(publicDir, relativePath);

  if (!absolutePath.startsWith(publicDir) || !fs.existsSync(absolutePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const ext = path.extname(absolutePath);
  response.writeHead(200, {
    "Content-Type": contentTypes[ext] || "application/octet-stream",
  });
  response.end(fs.readFileSync(absolutePath));
}

const MAX_PAYLOAD_BYTES = 1024 * 1024; // 1 MB

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let size = 0;
    let tooLarge = false;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_PAYLOAD_BYTES) {
        // CORRECTION AUDIT (probleme important #4) : on n'appelle plus request.destroy()
        // ici. Le destroy() coupait la connexion TCP avant que la reponse 413 (geree par
        // le catch de handleRequest) ne puisse etre ecrite, ce qui donnait au client une
        // simple coupure de connexion au lieu d'un vrai 413 JSON. On se contente desormais
        // d'arreter d'accumuler les donnees (pas de fuite memoire) et on laisse le flux
        // se terminer normalement pour que le 413 parte correctement.
        tooLarge = true;
        return;
      }
      raw += chunk;
    });
    request.on("end", () => {
      if (tooLarge) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        return;
      }
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error("JSON invalide."));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function startServer(port = 3300, config = {}) {
  const store = createTwinStore({
    workspaceRoot: config.workspaceRoot || path.join(rootDir, "sandbox"),
    persistencePath: config.persistencePath,
    pin: config.pin,
  });
  const server = http.createServer((request, response) => {
    handleRequest.call({ store }, request, response);
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3300);
  startServer(port).then(() => {
    console.log(`Permission Twin OS running on http://localhost:${port}`);
  });
}

module.exports = {
  startServer,
};
