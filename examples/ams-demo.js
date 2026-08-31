/**
 * Démo complète du standard AMS v0.1
 * 
 * 1. Création d'un mandat
 * 2. Validation de la structure
 * 3. Signature cryptographique
 * 4. Vérification de signature
 * 5. Autorisation d'une action
 * 6. Export JSON
 */

const http = require('http');

const SERVER = 'http://localhost:3300';

function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, SERVER);
        const data = body ? JSON.stringify(body) : null;
        
        const req = http.request(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
            }
        }, (res) => {
            let response = '';
            res.on('data', chunk => response += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(response));
                } catch {
                    resolve(response);
                }
            });
        });
        
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function main() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  Permission Twin OS - Démo AMS v0.1             ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    // ═══════════════════════════════════════════
    // ÉTAPE 1 : Créer un mandat
    // ═══════════════════════════════════════════
    console.log('📍 ÉTAPE 1 : Création d\'un mandat AMS\n');

    const createResponse = await request('POST', '/api/sdk/mandate/create', {
        principal: {
            type: 'human',
            id: 'did:example:alice-dupont',
            name: 'Alice Dupont'
        },
        agent: {
            type: 'ai-agent',
            id: 'agent-researcher-01',
            name: 'Research Agent'
        },
        permissions: [
            {
                action: 'purchase',
                constraints: {
                    maxAmount: 1000,
                    currency: 'USD',
                    allowedMerchants: ['AWS', 'Google Cloud', 'Azure']
                }
            },
            {
                action: 'research',
                constraints: {
                    allowedCategories: ['documentation', 'papers', 'tutorials']
                }
            }
        ],
        expiresAt: '2026-12-31T23:59:59.000Z',
        metadata: {
            department: 'R&D',
            project: 'Project-X'
        }
    });

    if (createResponse.error) {
        console.log('❌ Erreur:', createResponse.error);
        return;
    }

    const mandateId = createResponse.mandate.id;
    console.log('✅ Mandat créé:', mandateId);
    console.log('   Principal:', createResponse.mandate.principal.name);
    console.log('   Agent:', createResponse.mandate.agent.name);
    console.log('   Permissions:', createResponse.mandate.permissions.length);

    // ═══════════════════════════════════════════
    // ÉTAPE 2 : Récupérer le mandat
    // ═══════════════════════════════════════════
    console.log('\n📍 ÉTAPE 2 : Récupération du mandat\n');

    const getResponse = await request('GET', `/api/sdk/mandate/${mandateId}`);
    console.log('✅ Mandat récupéré');
    console.log('   ID:', getResponse.id);
    console.log('   Émis le:', getResponse.issuedAt);
    console.log('   Expire le:', getResponse.expiresAt);

    // ═══════════════════════════════════════════
    // ÉTAPE 3 : Vérifier la structure
    // ═══════════════════════════════════════════
    console.log('\n📍 ÉTAPE 3 : Validation de la structure\n');

    const verifyResponse = await request('POST', '/api/sdk/mandate/verify', {
        mandate: getResponse
    });

    console.log('✅ Structure valide:', verifyResponse.valid);
    if (!verifyResponse.valid) {
        console.log('   Erreurs:', verifyResponse.structure.errors);
    }

    // ═══════════════════════════════════════════
    // ÉTAPE 4 : Autoriser une action valide
    // ═══════════════════════════════════════════
    console.log('\n📍 ÉTAPE 4 : Test d\'autorisation - Action valide\n');

    const authValid = await request('POST', `/api/sdk/mandate/${mandateId}/authorize`, {
        action: {
            action: 'purchase',
            amount: 500,
            merchant: 'AWS'
        }
    });

    console.log(authValid.authorized ? 
        '✅ Action autorisée' : 
        '❌ Action refusée:', authValid.reason);

    // ═══════════════════════════════════════════
    // ÉTAPE 5 : Autoriser une action invalide
    // ═══════════════════════════════════════════
    console.log('\n📍 ÉTAPE 5 : Test d\'autorisation - Action invalide\n');

    const authInvalid = await request('POST', `/api/sdk/mandate/${mandateId}/authorize`, {
        action: {
            action: 'purchase',
            amount: 5000,  // Dépasse maxAmount
            merchant: 'AWS'
        }
    });

    console.log(authInvalid.authorized ? 
        '⚠️  Action autorisée (inattendu)' : 
        '✅ Action refusée comme prévu:', authInvalid.reason);

    // ═══════════════════════════════════════════
    // ÉTAPE 6 : Voir la spécification
    // ═══════════════════════════════════════════
    console.log('\n📍 ÉTAPE 6 : Spécification AMS\n');

    const spec = await request('GET', '/api/sdk/mandate/spec');
    console.log('✅ Spécification :', spec.name, 'v' + spec.version);
    console.log('   Contexte :', spec.context);

    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║  Démo AMS terminée !                              ║');
    console.log('║  Votre projet est prêt pour publication GitHub.  ║');
    console.log('╚══════════════════════════════════════════════════╝');
}

main().catch(console.error);
