/**
 * Agent Mandate Standard (AMS) v0.1
 * 
 * Un format standardisé pour les mandats d'agents IA autonomes.
 * Inspiré de W3C Verifiable Credentials, OAuth scopes et DID.
 * 
 * Un mandat AMS peut être :
 * - Créé par un humain ou une organisation (principal)
 * - Délivré à un agent IA
 * - Vérifié par n'importe quel tiers
 * - Signé cryptographiquement
 * - Combiné avec des preuves ZK
 */

const { createHash, createSign, createVerify, generateKeyPairSync } = require('crypto');
const stableStringify = require('fast-json-stable-stringify');

const AMS_VERSION = '0.1.0';
const AMS_CONTEXT = 'https://permission-twin.org/ams/v0.1';

class AgentMandateStandard {

    /**
     * Crée un nouveau mandat AMS
     * 
     * @param {Object} options
     * @param {Object} options.principal - Qui autorise (humain ou organisation)
     * @param {string} options.principal.id - Identifiant (DID recommandé)
     * @param {string} options.principal.type - 'human' | 'organization'
     * @param {string} [options.principal.name] - Nom lisible
     * @param {Object} options.agent - L'agent autorisé
     * @param {string} options.agent.id - Identifiant de l'agent
     * @param {string} options.agent.type - 'ai-agent' | 'autonomous-agent'
     * @param {string} [options.agent.name] - Nom de l'agent
     * @param {Object[]} options.permissions - Liste des permissions
     * @param {string} options.permissions[].action - Type d'action autorisée
     * @param {Object} [options.permissions[].constraints] - Contraintes
     * @param {number} [options.permissions[].constraints.maxAmount]
     * @param {string} [options.permissions[].constraints.currency]
     * @param {string[]} [options.permissions[].constraints.allowedMerchants]
     * @param {string[]} [options.permissions[].constraints.allowedCategories]
     * @param {string} [options.permissions[].constraints.geography]
     * @param {string} [options.expiresAt] - Date d'expiration ISO
     * @param {Object} [options.metadata] - Métadonnées additionnelles
     */
    static createMandate(options) {
        const now = new Date().toISOString();

        const mandate = {
            '@context': AMS_CONTEXT,
            'type': 'AgentMandate',
            'version': AMS_VERSION,
            'id': `ams:${createHash('sha256')
                .update(`${now}${Math.random()}`)
                .digest('hex')
                .substring(0, 16)}`,
            'issuedAt': now,
            'principal': {
                type: options.principal.type,
                id: options.principal.id,
                ...(options.principal.name && { name: options.principal.name })
            },
            'agent': {
                type: options.agent.type,
                id: options.agent.id,
                ...(options.agent.name && { name: options.agent.name })
            },
            'permissions': (options.permissions || []).map(p => ({
                action: p.action,
                ...(p.constraints && { constraints: p.constraints })
            })),
            ...(options.expiresAt && { expiresAt: options.expiresAt }),
            ...(options.metadata && { metadata: options.metadata }),
            'proof': null,  // À remplir avec ZK ou signature
            'signature': null  // À remplir après signature
        };

        return mandate;
    }

    /**
     * Valide la structure d'un mandat AMS
     * @param {Object} mandate
     * @returns {{ valid: boolean, errors: string[] }}
     */
    static validate(mandate) {
        const errors = [];

        if (!mandate['@context']) errors.push('Missing @context');
        if (mandate['@context'] !== AMS_CONTEXT) {
            errors.push(`Unsupported context: ${mandate['@context']}`);
        }
        if (mandate.type !== 'AgentMandate') errors.push('Invalid type');
        if (!mandate.version) errors.push('Missing version');
        if (!mandate.id) errors.push('Missing id');
        if (!mandate.principal) errors.push('Missing principal');
        if (!mandate.principal.id) errors.push('Missing principal.id');
        if (!mandate.agent) errors.push('Missing agent');
        if (!mandate.agent.id) errors.push('Missing agent.id');
        if (!Array.isArray(mandate.permissions)) errors.push('Missing permissions array');
        if (mandate.permissions && mandate.permissions.length === 0) {
            errors.push('Permissions array is empty');
        }
        
        if (mandate.permissions) {
            mandate.permissions.forEach((p, i) => {
                if (!p.action) errors.push(`Permission ${i}: missing action`);
            });
        }

        if (mandate.expiresAt) {
            const expiry = new Date(mandate.expiresAt);
            if (expiry < new Date()) {
                errors.push('Mandate has expired');
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Vérifie si une action est autorisée par le mandat
     * @param {Object} mandate - Mandat AMS
     * @param {Object} action - Action à vérifier
     * @returns {{ authorized: boolean, reason: string, permission: Object|null }}
     */
    static authorizeAction(mandate, action) {
        // Vérifier expiration
        if (mandate.expiresAt && new Date(mandate.expiresAt) < new Date()) {
            return { authorized: false, reason: 'Mandate expired', permission: null };
        }

        // Chercher une permission correspondante
        for (const permission of mandate.permissions) {
            if (permission.action === action.action || permission.action === '*') {
                const c = permission.constraints || {};

                // Vérifier montant
                if (c.maxAmount !== undefined && action.amount > c.maxAmount) {
                    return { 
                        authorized: false, 
                        reason: `Amount ${action.amount} exceeds max ${c.maxAmount}`, 
                        permission: null 
                    };
                }

                // Vérifier marchand
                if (c.allowedMerchants && !c.allowedMerchants.includes(action.merchant)) {
                    return { 
                        authorized: false, 
                        reason: `Merchant ${action.merchant} not allowed`, 
                        permission: null 
                    };
                }

                // Vérifier catégorie
                if (c.allowedCategories && !c.allowedCategories.includes(action.category)) {
                    return { 
                        authorized: false, 
                        reason: `Category ${action.category} not allowed`, 
                        permission: null 
                    };
                }

                // Tout passe
                return { authorized: true, reason: 'Authorized', permission: permission };
            }
        }

        return { authorized: false, reason: 'No matching permission', permission: null };
    }

    /**
     * Sérialise un mandat en JSON (pour export)
     */
    static toJSON(mandate) {
        return JSON.stringify(mandate, null, 2);
    }

    /**
     * Parse un mandat depuis une string JSON
     */
    static fromJSON(jsonString) {
        try {
            return JSON.parse(jsonString);
        } catch (error) {
            throw new Error(`Invalid AMS JSON: ${error.message}`);
        }
    }

    /**
     * Génère une paire de clés pour signer les mandats
     * @returns {{ publicKey: string, privateKey: string }}
     */
    static generateKeyPair() {
        const { publicKey, privateKey } = generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        return { publicKey, privateKey };
    }

    /**
     * Signe un mandat avec une clé privée
     * @param {Object} mandate - Le mandat à signer
     * @param {string} privateKey - Clé privée PEM
     * @returns {Object} Mandat avec signature ajoutée
     */
    static sign(mandate, privateKey) {
        const mandateCopy = { ...mandate };
        mandateCopy.signature = null; // Retirer signature pour hash
        
        const canonical = stableStringify(mandateCopy);
        const hash = createHash('sha256')
            .update(canonical)
            .digest('hex');

        const signer = createSign('RSA-SHA256');
        signer.update(canonical);
        const signature = signer.sign(privateKey, 'base64');

        mandateCopy.signature = {
            type: 'RSA-SHA256',
            created: new Date().toISOString(),
            hash: hash,
            value: signature
        };

        return mandateCopy;
    }

    /**
     * Vérifie la signature d'un mandat
     * @param {Object} mandate - Le mandat à vérifier
     * @param {string} publicKey - Clé publique PEM
     * @returns {{ valid: boolean, reason: string }}
     */
    static verifySignature(mandate, publicKey) {
        if (!mandate.signature) {
            return { valid: false, reason: 'No signature' };
        }

        const mandateCopy = { ...mandate };
        const savedSignature = mandateCopy.signature;
        mandateCopy.signature = null;

        const canonical = stableStringify(mandateCopy);
        const hash = createHash('sha256')
            .update(canonical)
            .digest('hex');

        if (hash !== savedSignature.hash) {
            return { valid: false, reason: 'Mandate was tampered' };
        }

        const verifier = createVerify('RSA-SHA256');
        verifier.update(canonical);
        const isValid = verifier.verify(publicKey, savedSignature.value, 'base64');

        return { 
            valid: isValid, 
            reason: isValid ? 'Signature valid' : 'Invalid signature' 
        };
    }
}

module.exports = AgentMandateStandard;
