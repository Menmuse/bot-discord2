/**
 * Gestionnaire des polices personnalisées
 * 
 * Utilitaire pour tester, valider et gérer les polices utilisées dans les PDFs
 */

const fs = require('fs');
const path = require('path');
const fontConfig = require('../config/fontConfig');

class FontManager {
    constructor() {
        this.fontsDir = path.join(__dirname, '../assets/fonts');
    }

    /**
     * Vérifie la disponibilité de toutes les polices configurées
     */
    checkAllFonts() {
        console.log('🔍 Vérification des polices configurées...\n');
        
        const results = {
            available: [],
            missing: [],
            unused: []
        };

        // Vérifier les polices configurées
        Object.entries(fontConfig).forEach(([modelName, config]) => {
            if (modelName === 'default' || !config.font) return;
            
            const fontPath = path.join(this.fontsDir, `${config.font}.ttf`);
            const exists = fs.existsSync(fontPath);
            
            if (exists) {
                results.available.push({
                    model: modelName,
                    font: config.font,
                    path: fontPath
                });
                console.log(`✅ ${modelName} → ${config.font}.ttf (disponible)`);
            } else {
                results.missing.push({
                    model: modelName,
                    font: config.font,
                    expectedPath: fontPath
                });
                console.log(`❌ ${modelName} → ${config.font}.ttf (MANQUANT)`);
            }
        });

        // Vérifier les polices non utilisées
        if (fs.existsSync(this.fontsDir)) {
            const fontFiles = fs.readdirSync(this.fontsDir)
                .filter(file => file.endsWith('.ttf'))
                .map(file => file.replace('.ttf', ''));

            const configuredFonts = Object.values(fontConfig)
                .map(config => config.font)
                .filter(font => font !== null);

            fontFiles.forEach(fontFile => {
                if (!configuredFonts.includes(fontFile)) {
                    results.unused.push(fontFile);
                }
            });
        }

        // Afficher le résumé
        console.log('\n📊 Résumé :');
        console.log(`   ✅ Polices disponibles : ${results.available.length}`);
        console.log(`   ❌ Polices manquantes : ${results.missing.length}`);
        console.log(`   ⚠️  Polices non utilisées : ${results.unused.length}`);

        if (results.unused.length > 0) {
            console.log('\n⚠️  Polices non utilisées :');
            results.unused.forEach(font => {
                console.log(`   - ${font}.ttf`);
            });
        }

        return results;
    }

    /**
     * Liste tous les modèles PDF disponibles
     */
    listPDFModels() {
        console.log('📄 Modèles PDF disponibles :\n');
        
        const templatesDir = path.join(__dirname, '../assets/pdf-templates');
        
        if (!fs.existsSync(templatesDir)) {
            console.log('❌ Dossier des templates PDF introuvable');
            return [];
        }

        const models = fs.readdirSync(templatesDir)
            .filter(file => file.endsWith('.pdf'))
            .map(file => file.replace('.pdf', ''));

        models.forEach(model => {
            const hasConfig = fontConfig[model] && fontConfig[model].font;
            const fontName = hasConfig ? fontConfig[model].font : 'défaut';
            const status = hasConfig ? '🎨' : '📝';
            
            console.log(`   ${status} ${model} → Police: ${fontName}`);
        });

        console.log(`\n📊 Total : ${models.length} modèles`);
        return models;
    }

    /**
     * Génère un template de configuration pour un nouveau modèle
     */
    generateConfigTemplate(modelName, fontName = 'Arial', fontSize = 12) {
        const template = `
    '${modelName}': {
        font: '${fontName}',
        fontSize: ${fontSize},
        color: [0, 0, 0] // noir
    },`;

        console.log(`📝 Template de configuration pour ${modelName} :\n`);
        console.log('Ajoutez ceci à config/fontConfig.js :');
        console.log(template);
        
        return template;
    }

    /**
     * Valide la configuration d'un modèle spécifique
     */
    validateModelConfig(modelName) {
        console.log(`🔍 Validation de la configuration pour ${modelName}\n`);
        
        if (!fontConfig[modelName]) {
            console.log(`❌ Aucune configuration trouvée pour ${modelName}`);
            console.log('💡 Utilisation de la configuration par défaut');
            return false;
        }

        const config = fontConfig[modelName];
        let isValid = true;

        // Vérifier la police
        if (config.font) {
            const fontPath = path.join(this.fontsDir, `${config.font}.ttf`);
            if (fs.existsSync(fontPath)) {
                console.log(`✅ Police : ${config.font}.ttf (disponible)`);
            } else {
                console.log(`❌ Police : ${config.font}.ttf (MANQUANT)`);
                isValid = false;
            }
        } else {
            console.log(`📝 Police : par défaut (pdf-lib)`);
        }

        // Vérifier la taille
        if (config.fontSize && (config.fontSize < 6 || config.fontSize > 72)) {
            console.log(`⚠️  Taille de police : ${config.fontSize} (recommandé: 8-16)`);
        } else {
            console.log(`✅ Taille de police : ${config.fontSize || 12}`);
        }

        // Vérifier la couleur
        if (config.color && Array.isArray(config.color) && config.color.length === 3) {
            const validColor = config.color.every(c => c >= 0 && c <= 1);
            if (validColor) {
                console.log(`✅ Couleur : RGB(${config.color.join(', ')})`);
            } else {
                console.log(`❌ Couleur : valeurs invalides (doivent être entre 0 et 1)`);
                isValid = false;
            }
        } else {
            console.log(`✅ Couleur : par défaut (noir)`);
        }

        console.log(`\n📊 Configuration ${isValid ? 'VALIDE' : 'INVALIDE'}`);
        return isValid;
    }

    /**
     * Affiche un rapport complet
     */
    generateReport() {
        console.log('📋 RAPPORT COMPLET DES POLICES\n');
        console.log('=' .repeat(50));
        
        this.listPDFModels();
        console.log('\n' + '=' .repeat(50));
        
        this.checkAllFonts();
        console.log('\n' + '=' .repeat(50));
        
        console.log('\n✨ Rapport terminé');
    }
}

// Export pour utilisation dans d'autres modules
module.exports = FontManager;

// Utilisation en ligne de commande
if (require.main === module) {
    const manager = new FontManager();
    
    const args = process.argv.slice(2);
    const command = args[0];
    
    switch (command) {
        case 'check':
            manager.checkAllFonts();
            break;
        case 'list':
            manager.listPDFModels();
            break;
        case 'validate':
            const modelName = args[1];
            if (modelName) {
                manager.validateModelConfig(modelName);
            } else {
                console.log('❌ Veuillez spécifier un nom de modèle');
                console.log('Usage: node fontManager.js validate <nom_modele>');
            }
            break;
        case 'template':
            const newModel = args[1];
            const fontName = args[2] || 'Arial';
            const fontSize = parseInt(args[3]) || 12;
            if (newModel) {
                manager.generateConfigTemplate(newModel, fontName, fontSize);
            } else {
                console.log('❌ Veuillez spécifier un nom de modèle');
                console.log('Usage: node fontManager.js template <nom_modele> [police] [taille]');
            }
            break;
        case 'report':
        default:
            manager.generateReport();
            break;
    }
}