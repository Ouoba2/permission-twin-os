# Permission Twin OS + AMS

**Runtime de gouvernance pour agents IA autonomes + Standard Agent Mandate**

> **English summary.** Permission Twin OS is a governance runtime that sits between an AI agent and its execution environment: each action gets an impact preflight and a risk score, readable policies are applied, risky actions escalate to a human, and everything is written to an audit trail. An optional ZK module and the Agent Mandate Standard (AMS) let an agent prove it is authorized to act without revealing its mandate. **v0.4 alpha, proof of concept, not for production.** The rest of this README is in French.

Permission Twin OS se place entre un agent IA et son environnement d'exécution pour transformer toute action brute en intention explicable, produire un preflight d'impact, classer le risque, appliquer des policies lisibles, escalader vers un humain si besoin, et journaliser dans un audit trail.

Avec le **module ZK** et le **standard AMS**, Permission Twin OS permet aux agents de **prouver qu'ils ont le droit d'agir sans révéler leur mandat**.

## 🎯 Fonctionnalités

- ✅ **Gouvernance** : Policies lisibles, scoring de risque, décisions explicables
- ✅ **Escalade humaine** : Override humain toujours possible
- ✅ **Audit trail** : Journalisation complète + snapshots
- ✅ **Preuves ZK** : Prouver l'autorisation sans révéler le mandat
- ✅ **Standard AMS** : Format JSON portable pour les mandats
- ✅ **Workspaces isolés** : Séparation des contextes
- ✅ **SDK HTTP** : API REST pour intégrer dans n'importe quel agent

## 🚀 Quick Start

```bash
# Cloner et installer
git clone https://github.com/Ouoba2/permission-twin-os.git
cd permission-twin-os
npm install

# Lancer le serveur
node server.js

# Interface web : http://localhost:3300 (PIN: 4242)
```

## 📚 Le Standard AMS

L'**Agent Mandate Standard (AMS)** est un format JSON pour les mandats d'agents.

### Exemple de mandat

```json
{
  "@context": "https://permission-twin.org/ams/v0.1",
  "type": "AgentMandate",
  "version": "0.1.0",
  "principal": {
    "type": "human",
    "id": "did:example:alice"
  },
  "agent": {
    "type": "ai-agent",
    "id": "researcher-01"
  },
  "permissions": [
    {
      "action": "purchase",
      "constraints": {
        "maxAmount": 1000,
        "allowedMerchants": ["AWS", "GCP"]
      }
    }
  ]
}
```

### API AMS

```bash
# Créer un mandat
POST /api/sdk/mandate/create

# Vérifier un mandat
POST /api/sdk/mandate/verify

# Autoriser une action
POST /api/sdk/mandate/:id/authorize

# Voir la spécification
GET /api/sdk/mandate/spec
```

## 🔐 Preuve ZK

```javascript
// 1. L'agent demande une preuve
const proof = await fetch('/api/sdk/proof', {
  method: 'POST',
  headers: { 'x-agent-token': 'TOKEN' },
  body: JSON.stringify({
    action: { amount: 500, merchant: 'AWS' }
  })
});

// 2. Le tiers vérifie SANS voir le mandat
const proofData = await proof.json();
const verify = await fetch('/api/sdk/verify-proof', {
  method: 'POST',
  body: JSON.stringify({
    proof: proofData.proof.proof,
    publicSignals: proofData.proof.publicSignals
  })
});

const result = await verify.json();
// Résultat : { valid: true }
```

## 🧪 Démo

```bash
# Démo gouvernance
npm run agent:demo -- "Open https://www.openai.com"

# Démo ZK
npm run zk:demo

# Démo AMS
npm run ams:demo

# Tests
npm test
npm run test:zk
```

## 📖 Documentation

- [Spécification AMS v0.1](SPEC.md)
- [Guide de contribution](CONTRIBUTING.md)

*Les guides `Architecture` et `Intégration` seront ajoutés en v0.5.*

## ⚠️ Disclaimer — v0.4 Alpha

Ce projet est une **preuve de concept** destinée à valider l'architecture. 
**Ne pas utiliser en production.**

Limitations connues :
- Policies de gouvernance partiellement hardcodées (v0.5)
- Tokens de démo en clair (v0.5)
- Pas de headers de sécurité HTTP (v0.5)

## 🛣️ Roadmap

- [x] v0.1 : Runtime de gouvernance local
- [x] v0.2 : SDK HTTP + agents externes
- [x] v0.3 : Preuves ZK (Zero-Knowledge)
- [x] v0.4 : Standard AMS v0.1
- [ ] v0.5 : Intégrations (MCP, Stripe MPP, x402)
- [ ] v0.6 : SDK Python
- [ ] v1.0 : Version stable + gouvernance communautaire

## 🤝 Contribuer

Les contributions sont les bienvenues ! Voir [CONTRIBUTING.md](CONTRIBUTING.md).

## 📄 Licence

MIT License - voir [LICENSE](LICENSE).
