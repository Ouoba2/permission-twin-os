/**
 * Démo : Preuve ZK de bout en bout
 * Acte 1 : Agent demande une preuve à Permission Twin OS
 * Acte 2 : Agent envoie JUSTE la preuve à un tiers (simulé)
 * Acte 3 : Tiers vérifie la preuve sans voir le mandat
 */

const http = require('http');

const SERVER = 'http://localhost:3300';
const AGENT_TOKEN = 'twin_demo_local_token';

function request(method, path, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, SERVER);
        const data = body ? JSON.stringify(body) : null;
        
        const req = http.request(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers,
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
    console.log('║  Permission Twin OS - Démo Preuve ZK           ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    // ═══════════════════════════════════════════
    // ACTE 1 : L'agent demande une preuve
    // ═══════════════════════════════════════════
    console.log('📍 ACTE 1 : Agent demande une preuve ZK');
    console.log('   Agent veut acheter 500$ chez AWS\n');

    const proofResponse = await request('POST', '/api/sdk/proof', {
        action: {
            type: 'purchase',
            amount: 500,
            merchant: 'AWS',
            description: 'Achat de compute EC2'
        }
    }, {
        'x-agent-token': AGENT_TOKEN
    });

    if (proofResponse.error) {
        console.log('❌ Erreur:', proofResponse.error);
        return;
    }

    console.log('✅ Preuve générée !');
    console.log('   Risque évalué:', proofResponse.governance?.risk);
    console.log('   Décision:', proofResponse.governance?.decision);
    console.log('   Hash preuve:', proofResponse.proof.metadata ? 
        'présent' : 'N/A');
    console.log('\n   📦 Ce que l\'agent va envoyer au tiers :');
    console.log('      - La preuve ZK (proof + publicSignals)');
    console.log('      - ❌ PAS le mandat complet');
    console.log('      - ❌ PAS le budget total');
    console.log('      - ❌ PAS la liste des marchands autorisés\n');

    // ═══════════════════════════════════════════
    // ACTE 2 : Le tiers reçoit et vérifie
    // ═══════════════════════════════════════════
    console.log('📍 ACTE 2 : Tiers (AWS) vérifie la preuve');
    console.log('   AWS ne voit QUE la preuve, pas le mandat\n');

    const verifyResponse = await request('POST', '/api/sdk/verify-proof', {
        proof: proofResponse.proof.proof,
        publicSignals: proofResponse.proof.publicSignals
    });

    console.log(verifyResponse.valid ? 
        '✅ ' + verifyResponse.message : 
        '❌ ' + verifyResponse.message);
    console.log('   Vérifié à:', verifyResponse.verifiedAt);
    console.log('   Signaux publics (seule info visible):', 
        verifyResponse.publicSignals);

    // ═══════════════════════════════════════════
    // ACTE 3 : Tentative de fraude
    // ═══════════════════════════════════════════
    console.log('\n📍 ACTE 3 : Test de fraude (montant modifié)');
    console.log('   L\'agent essaie de réutiliser la preuve pour 5000$\n');

    // On génère une preuve pour un montant qui dépasse
    const fraudResponse = await request('POST', '/api/sdk/proof', {
        action: {
            type: 'purchase',
            amount: 5000, // Dépasse le mandat
            merchant: 'AWS',
            description: 'Tentative de fraude'
        }
    }, {
        'x-agent-token': AGENT_TOKEN
    });

    if (fraudResponse.error) {
        console.log('🛡️  FRAUDE BLOQUÉE:', fraudResponse.error);
    } else {
        // Vérifier la preuve frauduleuse
        const fraudVerify = await request('POST', '/api/sdk/verify-proof', {
            proof: fraudResponse.proof.proof,
            publicSignals: fraudResponse.proof.publicSignals
        });
        console.log(fraudVerify.valid ? 
            '⚠️  Preuve valide (à investiguer)' : 
            '🛡️  FRAUDE DÉTECTÉE: ' + fraudVerify.message);
    }

    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║  Démo terminée !                                 ║');
    console.log('║  Permission Twin OS = Gouvernance + Preuve ZK   ║');
    console.log('╚══════════════════════════════════════════════════╝');
}

main().catch(console.error);
