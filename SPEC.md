# Agent Mandate Standard (AMS) v0.1

## Overview

L'**Agent Mandate Standard (AMS)** est un format JSON pour exprimer, signer et vérifier les autorisations d'agents IA autonomes.

## Motivation

Avec l'émergence des agents IA autonomes, les entreprises ont besoin d'un moyen **standard, portable et vérifiable** de dire :

> "Cet agent est autorisé à faire X, dans les limites Y, jusqu'à la date Z."

AMS est conçu pour :
- Être **lisible par les humains** (JSON simple)
- Être **vérifiable par les machines** (validation stricte)
- Être **portable** (fonctionne partout)
- Être **signable cryptographiquement** (RSA-SHA256)
- Être **compatible ZK** (preuve sans révéler le contenu)

## Structure

```json
{
  "@context": "https://permission-twin.org/ams/v0.1",
  "type": "AgentMandate",
  "version": "0.1.0",
  "id": "ams:abc123def456",
  "issuedAt": "2026-08-29T23:00:00.000Z",
  "principal": { ... },
  "agent": { ... },
  "permissions": [ ... ],
  "expiresAt": "2026-12-31T23:59:59.000Z",
  "metadata": { ... },
  "signature": { ... },
  "proof": { ... }
}
```

## Champs

### Champs requis

| Champ | Type | Description |
|-------|------|-------------|
| `@context` | string | URL du contexte |
| `type` | string | Toujours `AgentMandate` |
| `version` | string | Version du standard |
| `id` | string | Identifiant unique |
| `issuedAt` | string | Date ISO 8601 |
| `principal` | object | Qui autorise |
| `agent` | object | L'agent autorisé |
| `permissions` | array | Liste des permissions |

### Principal

```json
{
  "type": "human" | "organization",
  "id": "did:example:alice",
  "name": "Alice Dupont"  // optionnel
}
```

### Agent

```json
{
  "type": "ai-agent" | "autonomous-agent",
  "id": "agent-123",
  "name": "Research Agent"  // optionnel
}
```

### Permissions

```json
{
  "action": "purchase" | "research" | "execute" | "*",
  "constraints": {
    "maxAmount": 1000,
    "currency": "USD",
    "allowedMerchants": ["AWS", "GCP"],
    "allowedCategories": ["compute", "storage"],
    "geography": "US,EU"
  }
}
```

### Signature (optionnelle)

```json
{
  "type": "RSA-SHA256",
  "created": "2026-08-29T23:00:00.000Z",
  "hash": "sha256hash...",
  "value": "base64signature..."
}
```

## Validation

Un mandat valide doit :
1. Avoir tous les champs requis
2. Avoir un `@context` reconnu
3. Avoir au moins une permission
4. Ne pas être expiré

## Compatibilité

- **W3C DID** : `principal.id` et `agent.id` peuvent être des DID
- **Verifiable Credentials** : AMS peut être encapsulé dans un VC
- **OAuth 2.0** : `permissions` est analogue à `scope`

## ⚠️ Security Notes

### Vérification des preuves ZK associées

Un vérificateur tiers indépendant **doit TOUJOURS** vérifier **deux choses** :

1. **Validité cryptographique** : `snarkjs.groth16.verify(vkey, publicSignals, proof)` retourne `true`
2. **Résultat métier** : `publicSignals[0] === "1"` (l'action respecte bien le mandat)

> **ATTENTION** : Une preuve peut être cryptographiquement valide (`verify` → `true`) mais correspondre à une action **non autorisée** (`publicSignals[0] === "0"`). Ne vérifiez **JAMAIS** uniquement la validité cryptographique.

Exemple de vérification complète :

```javascript
const isCryptoValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
const isActionAuthorized = publicSignals[0] === "1";

if (isCryptoValid && isActionAuthorized) {
    // Action autorisée
} else {
    // Refuser
}
```

## Roadmap

- v0.1 : Format de base (actuel)
- v0.2 : Support multi-permissions avec priorité
- v0.3 : Délégation de mandats
- v1.0 : Standard stable avec gouvernance communautaire

## Licence

MIT License - libre d'utilisation commerciale et modification.
