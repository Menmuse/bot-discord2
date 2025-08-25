const fs = require('fs');
const path = require('path');
const { PDFDocument: PDFLib, rgb, StandardFonts } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const crypto = require('crypto');
const fontConfig = require('../config/fontConfig');

class FactureUtils {
    constructor() {
        this.fontsCache = new Map();
        this.outputDir = path.join(__dirname, '../outputs');
        this.fontsDir = path.join(__dirname, '../assets/fonts');
        
        // Créer les dossiers s'ils n'existent pas
        this.ensureDirectories();
    }

    ensureDirectories() {
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
        
        if (!fs.existsSync(this.fontsDir)) {
            fs.mkdirSync(this.fontsDir, { recursive: true });
        }
    }

    /**
     * Génère une facture PDF complète
     */
    async generateInvoice(templatePath, fieldValues, userId, modelName) {
        try {
            // Charger le PDF template
            const pdfBytes = fs.readFileSync(templatePath);
            const pdfDoc = await PDFLib.load(pdfBytes);
            
            // Activer fontkit pour le support des polices personnalisées
            pdfDoc.registerFontkit(fontkit);
            
            const form = pdfDoc.getForm();
            const fields = form.getFields();

            // Charger la police spécifique au modèle si configurée
            const modelFont = await this.loadModelFont(pdfDoc, modelName);

            // Traiter tous les champs avec la police du modèle
            await this.processFields(form, fields, fieldValues, modelFont, modelName);

            // Aplatir le formulaire pour empêcher les modifications
            form.flatten();

            // Protéger le PDF avec un mot de passe
            const password = this.generatePassword();
            
            // Sauvegarder le PDF
            const pdfBytesOutput = await pdfDoc.save({
                userPassword: password,
                ownerPassword: password + '_owner',
                permissions: {
                    printing: 'highResolution',
                    modifying: false,
                    copying: false,
                    annotating: false,
                    fillingForms: false,
                    contentAccessibility: true,
                    documentAssembly: false
                }
            });

            // Créer le nom de fichier unique
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `facture_${modelName}_${userId}_${timestamp}.pdf`;
            const outputPath = path.join(this.outputDir, fileName);

            // Écrire le fichier
            fs.writeFileSync(outputPath, pdfBytesOutput);

            // Programmer la suppression automatique après 10 minutes
            this.scheduleFileDeletion(outputPath, 10 * 60 * 1000);

            return {
                filePath: outputPath,
                fileName: fileName,
                password: password,
                size: pdfBytesOutput.length
            };

        } catch (error) {
            console.error('Erreur lors de la génération de la facture:', error);
            throw error;
        }
    }

    /**
     * Traite tous les champs du formulaire PDF
     */
    async processFields(form, fields, fieldValues, modelFont = null, modelName = null) {
        // Identifier les champs de base et calculés
        const baseFields = new Map();
        const calculatedFields = [];

        fields.forEach(field => {
            const fieldName = field.getName();
            if (this.isCalculatedField(fieldName)) {
                calculatedFields.push(field);
            } else if (fieldValues[fieldName] !== undefined) {
                baseFields.set(fieldName, fieldValues[fieldName]);
            }
        });

        // Remplir les champs de base
        for (const [fieldName, value] of baseFields) {
            await this.fillField(form, fieldName, value, modelFont, modelName);
        }

        // Calculer et remplir les champs calculés
        for (const field of calculatedFields) {
            const fieldName = field.getName();
            const baseFieldName = this.extractBaseFieldName(fieldName);
            const baseValue = baseFields.get(baseFieldName);
            
            if (baseValue !== undefined) {
                const calculatedValue = this.calculateFieldValue(baseValue, fieldName);
                await this.fillField(form, fieldName, calculatedValue, modelFont, modelName);
            }
        }
    }

    /**
     * Remplit un champ spécifique du PDF
     */
    async fillField(form, fieldName, value, modelFont = null, modelName = null) {
        try {
            const field = form.getField(fieldName);
            
            if (field) {
                // Remplir le champ avec la valeur
                if (field.constructor.name === 'PDFTextField') {
                    field.setText(value.toString());
                    
                    // Appliquer la police et les propriétés du modèle si disponibles
                    if (modelName) {
                        const config = this.getModelFontConfig(modelName);
                        try {
                            // Choisir la police selon la disponibilité et le fontWeight
                            let fontToUse = null;
                            
                            if (modelFont) {
                                // Utiliser la police personnalisée si elle est chargée
                                fontToUse = modelFont;
                            } else {
                                // Fallback vers les polices standards selon le fontWeight
                                const pdfDoc = form.doc;
                                if (config.fontWeight === 'bold') {
                                    fontToUse = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
                                } else {
                                    fontToUse = await pdfDoc.embedFont(StandardFonts.Helvetica);
                                }
                            }
                            
                            if (fontToUse) {
                                // Appliquer la police au champ
                                field.updateAppearances(fontToUse);
                                
                                // Note: pdf-lib ne permet pas de définir fontSize et color via updateAppearances
                                // Ces propriétés doivent être définies au niveau du template PDF
                            }
                        } catch (fontError) {
                            console.warn(`Impossible d'appliquer la police au champ ${fieldName}:`, fontError.message);
                            // Continuer sans la police personnalisée
                        }
                    }
                } else if (field.constructor.name === 'PDFCheckBox') {
                    const boolValue = ['true', '1', 'oui', 'yes', 'on'].includes(value.toString().toLowerCase());
                    if (boolValue) {
                        field.check();
                    } else {
                        field.uncheck();
                    }
                }
            }
        } catch (error) {
            console.error(`Erreur lors du remplissage du champ ${fieldName}:`, error);
        }
    }

    /**
     * Charge la police spécifique au modèle
     */
    async loadModelFont(pdfDoc, modelName) {
        if (!modelName || !fontConfig[modelName]) {
            return null;
        }

        const config = fontConfig[modelName];
        if (!config.font) {
            return null;
        }

        return await this.loadCustomFont(pdfDoc, config.font);
    }

    /**
     * Obtient la configuration de police pour un modèle
     */
    getModelFontConfig(modelName) {
        const defaultConfig = fontConfig.default || {
            fontSize: 12,
            color: [0, 0, 0], // noir par défaut
            fontWeight: 'normal'
        };

        if (!modelName || !fontConfig[modelName]) {
            return defaultConfig;
        }

        const config = fontConfig[modelName];
        return {
            fontSize: config.fontSize || defaultConfig.fontSize,
            color: config.color || defaultConfig.color,
            fontWeight: config.fontWeight || defaultConfig.fontWeight
        };
    }

    /**
     * Charge une police personnalisée
     */
    async loadCustomFont(pdfDoc, fontName) {
        if (this.fontsCache.has(fontName)) {
            return this.fontsCache.get(fontName);
        }

        try {
            const fontPath = path.join(this.fontsDir, `${fontName}.ttf`);
            
            if (fs.existsSync(fontPath)) {
                const fontBytes = fs.readFileSync(fontPath);
                const font = await pdfDoc.embedFont(fontBytes);
                this.fontsCache.set(fontName, font);
                return font;
            }
        } catch (error) {
            console.error(`Erreur lors du chargement de la police ${fontName}:`, error);
        }

        return null;
    }

    /**
     * Vérifie si un champ est calculé automatiquement
     */
    isCalculatedField(fieldName) {
        const calculationPatterns = [
            /\+\d+%/,           // prix+20%
            /\*\d+\.?\d*/,      // prix*1.2
            /-\d+%/,            // prix-10%
            /\/\d+\.?\d*/,      // prix/2
            /HT->TTC/i,         // HT vers TTC
            /TTC->HT/i,         // TTC vers HT
            /\+\d+/,            // prix+100
            /-\d+/              // prix-50
        ];
        
        return calculationPatterns.some(pattern => pattern.test(fieldName));
    }

    /**
     * Extrait le nom du champ de base à partir d'un champ calculé
     */
    extractBaseFieldName(calculatedFieldName) {
        // Supprimer les opérations de calcul pour obtenir le champ de base
        return calculatedFieldName
            .replace(/\+\d+%/, '')
            .replace(/\*\d+\.?\d*/, '')
            .replace(/-\d+%/, '')
            .replace(/\/\d+\.?\d*/, '')
            .replace(/HT->TTC/i, '')
            .replace(/TTC->HT/i, '')
            .replace(/\+\d+/, '')
            .replace(/-\d+/, '')
            .trim();
    }

    /**
     * Calcule la valeur d'un champ automatique
     */
    calculateFieldValue(baseValue, fieldName) {
        try {
            const numericValue = parseFloat(baseValue.toString().replace(/[^\d.-]/g, ''));
            
            if (isNaN(numericValue)) return baseValue;

            // Pourcentages d'addition
            const addPercentMatch = fieldName.match(/\+(\d+)%/);
            if (addPercentMatch) {
                const percent = parseInt(addPercentMatch[1]);
                return (numericValue * (1 + percent / 100)).toFixed(2);
            }

            // Pourcentages de soustraction
            const subPercentMatch = fieldName.match(/-(\d+)%/);
            if (subPercentMatch) {
                const percent = parseInt(subPercentMatch[1]);
                return (numericValue * (1 - percent / 100)).toFixed(2);
            }

            // Multiplication
            const multiplyMatch = fieldName.match(/\*(\d+\.?\d*)/);
            if (multiplyMatch) {
                const multiplier = parseFloat(multiplyMatch[1]);
                return (numericValue * multiplier).toFixed(2);
            }

            // Division
            const divideMatch = fieldName.match(/\/(\d+\.?\d*)/);
            if (divideMatch) {
                const divisor = parseFloat(divideMatch[1]);
                return (numericValue / divisor).toFixed(2);
            }

            // Addition simple
            const addMatch = fieldName.match(/\+(\d+)/);
            if (addMatch) {
                const addition = parseInt(addMatch[1]);
                return (numericValue + addition).toFixed(2);
            }

            // Soustraction simple
            const subMatch = fieldName.match(/-(\d+)/);
            if (subMatch) {
                const subtraction = parseInt(subMatch[1]);
                return (numericValue - subtraction).toFixed(2);
            }

            // Conversion HT vers TTC (TVA 20% par défaut)
            if (/HT->TTC/i.test(fieldName)) {
                return (numericValue * 1.20).toFixed(2);
            }

            // Conversion TTC vers HT
            if (/TTC->HT/i.test(fieldName)) {
                return (numericValue / 1.20).toFixed(2);
            }

            return baseValue;
        } catch (error) {
            console.error('Erreur lors du calcul automatique:', error);
            return baseValue;
        }
    }

    /**
     * Génère un mot de passe sécurisé pour le PDF
     */
    generatePassword() {
        return crypto.randomBytes(8).toString('hex').toUpperCase();
    }

    /**
     * Programme la suppression automatique d'un fichier
     */
    scheduleFileDeletion(filePath, delayMs) {
        setTimeout(() => {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`Fichier supprimé automatiquement: ${path.basename(filePath)}`);
                }
            } catch (error) {
                console.error(`Erreur lors de la suppression automatique de ${filePath}:`, error);
            }
        }, delayMs);
    }

    /**
     * Nettoie les anciens fichiers (sécurité supplémentaire)
     */
    cleanupOldFiles() {
        try {
            const files = fs.readdirSync(this.outputDir);
            const now = Date.now();
            const maxAge = 15 * 60 * 1000; // 15 minutes

            files.forEach(file => {
                const filePath = path.join(this.outputDir, file);
                const stats = fs.statSync(filePath);
                
                if (now - stats.mtime.getTime() > maxAge) {
                    fs.unlinkSync(filePath);
                    console.log(`Ancien fichier nettoyé: ${file}`);
                }
            });
        } catch (error) {
            console.error('Erreur lors du nettoyage des anciens fichiers:', error);
        }
    }
}

module.exports = new FactureUtils();