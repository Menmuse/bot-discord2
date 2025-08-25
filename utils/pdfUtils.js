const fs = require('fs').promises;
const path = require('path');
const { PDFDocument, PDFForm } = require('pdf-lib');

class PDFUtils {
    /**
     * Obtient la liste des modèles PDF disponibles
     * @returns {Promise<Array<string>>} - Liste des noms de modèles
     */
    static async getAvailableTemplates() {
        try {
            const templatesDir = path.join(__dirname, '..', 'assets', 'pdf-templates');
            
            // Vérifier si le répertoire existe
            try {
                await fs.access(templatesDir);
            } catch {
                // Créer le répertoire s'il n'existe pas
                await fs.mkdir(templatesDir, { recursive: true });
                return [];
            }

            const files = await fs.readdir(templatesDir);
            return files
                .filter(file => file.endsWith('.pdf'))
                .map(file => path.basename(file, '.pdf'));
        } catch (error) {
            console.error('Erreur lors de la récupération des modèles PDF:', error);
            return [];
        }
    }

    /**
     * Charge un modèle PDF et extrait ses champs
     * @param {string} templateName - Nom du modèle
     * @returns {Promise<Object>} - Objet contenant le PDF et les champs
     */
    static async loadTemplate(templateName) {
        try {
            const templatePath = path.join(__dirname, '..', 'assets', 'pdf-templates', `${templateName}.pdf`);
            
            // Vérifier si le fichier existe
            try {
                await fs.access(templatePath);
            } catch {
                throw new Error(`Modèle PDF "${templateName}" introuvable.`);
            }

            // Charger le PDF
            const pdfBytes = await fs.readFile(templatePath);
            const pdfDoc = await PDFDocument.load(pdfBytes);
            const form = pdfDoc.getForm();

            // Extraire les champs
            const fields = form.getFields().map(field => {
                const fieldName = field.getName();
                let fieldType = 'text';
                let options = null;

                // Déterminer le type de champ
                if (field.constructor.name === 'PDFCheckBox') {
                    fieldType = 'checkbox';
                } else if (field.constructor.name === 'PDFDropdown') {
                    fieldType = 'dropdown';
                    options = field.getOptions();
                } else if (field.constructor.name === 'PDFRadioGroup') {
                    fieldType = 'radio';
                    options = field.getOptions();
                }

                return {
                    name: fieldName,
                    type: fieldType,
                    options: options,
                    required: false // Par défaut, peut être modifié selon les besoins
                };
            });

            return {
                pdfDoc,
                form,
                fields,
                templateName
            };
        } catch (error) {
            console.error(`Erreur lors du chargement du modèle ${templateName}:`, error);
            throw error;
        }
    }

    /**
     * Remplit un PDF avec les données fournies
     * @param {string} templateName - Nom du modèle
     * @param {Object} fieldData - Données des champs
     * @param {string} userId - ID de l'utilisateur
     * @returns {Promise<Buffer>} - PDF rempli en tant que buffer
     */
    static async fillPDF(templateName, fieldData, userId) {
        try {
            const template = await this.loadTemplate(templateName);
            const { pdfDoc, form } = template;

            // Remplir les champs
            for (const [fieldName, fieldValue] of Object.entries(fieldData)) {
                try {
                    const field = form.getField(fieldName);
                    
                    if (field.constructor.name === 'PDFTextField') {
                        field.setText(String(fieldValue));
                    } else if (field.constructor.name === 'PDFCheckBox') {
                        if (fieldValue === 'true' || fieldValue === true) {
                            field.check();
                        } else {
                            field.uncheck();
                        }
                    } else if (field.constructor.name === 'PDFDropdown') {
                        field.select(String(fieldValue));
                    } else if (field.constructor.name === 'PDFRadioGroup') {
                        field.select(String(fieldValue));
                    }
                } catch (fieldError) {
                    console.warn(`Impossible de remplir le champ ${fieldName}:`, fieldError.message);
                }
            }

            // Ajouter des métadonnées
            pdfDoc.setTitle(`${templateName} - ${userId}`);
            pdfDoc.setAuthor('MenMuse Bot');
            pdfDoc.setCreator('MenMuse Bot PDF Generator');
            pdfDoc.setCreationDate(new Date());
            pdfDoc.setModificationDate(new Date());

            // Optionnel: Aplatir le formulaire pour empêcher les modifications
            // form.flatten();

            // Générer le PDF
            const pdfBytes = await pdfDoc.save();
            return Buffer.from(pdfBytes);
        } catch (error) {
            console.error('Erreur lors du remplissage du PDF:', error);
            throw error;
        }
    }

    /**
     * Sauvegarde un PDF généré
     * @param {Buffer} pdfBuffer - Buffer du PDF
     * @param {string} fileName - Nom du fichier
     * @returns {Promise<string>} - Chemin du fichier sauvegardé
     */
    static async savePDF(pdfBuffer, fileName) {
        try {
            const outputDir = path.join(__dirname, '..', 'assets', 'generated-pdfs');
            
            // Créer le répertoire s'il n'existe pas
            await fs.mkdir(outputDir, { recursive: true });

            const filePath = path.join(outputDir, fileName);
            await fs.writeFile(filePath, pdfBuffer);

            return filePath;
        } catch (error) {
            console.error('Erreur lors de la sauvegarde du PDF:', error);
            throw error;
        }
    }

    /**
     * Nettoie les anciens PDF générés
     * @param {number} maxAgeHours - Âge maximum en heures
     * @returns {Promise<number>} - Nombre de fichiers supprimés
     */
    static async cleanupOldPDFs(maxAgeHours = 24) {
        try {
            const outputDir = path.join(__dirname, '..', 'assets', 'generated-pdfs');
            
            try {
                await fs.access(outputDir);
            } catch {
                return 0; // Répertoire n'existe pas
            }

            const files = await fs.readdir(outputDir);
            const maxAge = maxAgeHours * 60 * 60 * 1000; // Convertir en millisecondes
            const now = Date.now();
            let deletedCount = 0;

            for (const file of files) {
                if (!file.endsWith('.pdf')) continue;

                const filePath = path.join(outputDir, file);
                const stats = await fs.stat(filePath);
                const fileAge = now - stats.mtime.getTime();

                if (fileAge > maxAge) {
                    await fs.unlink(filePath);
                    deletedCount++;
                }
            }

            return deletedCount;
        } catch (error) {
            console.error('Erreur lors du nettoyage des PDF:', error);
            return 0;
        }
    }

    /**
     * Valide les données de champs
     * @param {Array} fields - Champs du formulaire
     * @param {Object} fieldData - Données à valider
     * @returns {Object} - Résultat de la validation
     */
    static validateFieldData(fields, fieldData) {
        const errors = [];
        const validData = {};

        for (const field of fields) {
            const value = fieldData[field.name];

            // Vérifier les champs requis
            if (field.required && (!value || value.trim() === '')) {
                errors.push(`Le champ "${field.name}" est requis.`);
                continue;
            }

            // Valider selon le type de champ
            switch (field.type) {
                case 'dropdown':
                case 'radio':
                    if (value && field.options && !field.options.includes(value)) {
                        errors.push(`Valeur invalide pour le champ "${field.name}".`);
                    } else {
                        validData[field.name] = value;
                    }
                    break;
                
                case 'checkbox':
                    validData[field.name] = value === 'true' || value === true;
                    break;
                
                case 'text':
                default:
                    // Limiter la longueur du texte
                    if (value && value.length > 1000) {
                        errors.push(`Le champ "${field.name}" est trop long (max 1000 caractères).`);
                    } else {
                        validData[field.name] = value || '';
                    }
                    break;
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            validData
        };
    }

    /**
     * Génère un nom de fichier unique pour un PDF
     * @param {string} templateName - Nom du modèle
     * @param {string} userId - ID de l'utilisateur
     * @returns {string} - Nom de fichier unique
     */
    static generateFileName(templateName, userId) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        return `${templateName}_${userId}_${timestamp}_${randomSuffix}.pdf`;
    }

    /**
     * Obtient les informations d'un modèle PDF
     * @param {string} templateName - Nom du modèle
     * @returns {Promise<Object>} - Informations du modèle
     */
    static async getTemplateInfo(templateName) {
        try {
            const template = await this.loadTemplate(templateName);
            const { fields, pdfDoc } = template;

            return {
                name: templateName,
                fieldCount: fields.length,
                fields: fields.map(field => ({
                    name: field.name,
                    type: field.type,
                    hasOptions: field.options && field.options.length > 0
                })),
                pageCount: pdfDoc.getPageCount(),
                title: pdfDoc.getTitle() || templateName
            };
        } catch (error) {
            console.error(`Erreur lors de la récupération des infos du modèle ${templateName}:`, error);
            throw error;
        }
    }

    /**
     * Divise les champs en groupes pour les modales Discord
     * @param {Array} fields - Liste des champs
     * @param {number} groupSize - Taille de chaque groupe
     * @returns {Array<Array>} - Groupes de champs
     */
    static groupFields(fields, groupSize = 5) {
        const groups = [];
        for (let i = 0; i < fields.length; i += groupSize) {
            groups.push(fields.slice(i, i + groupSize));
        }
        return groups;
    }

    /**
     * Formate le nom d'un champ pour l'affichage
     * @param {string} fieldName - Nom du champ
     * @returns {string} - Nom formaté
     */
    static formatFieldName(fieldName) {
        return fieldName
            .replace(/([A-Z])/g, ' $1') // Ajouter des espaces avant les majuscules
            .replace(/[_-]/g, ' ') // Remplacer les underscores et tirets par des espaces
            .replace(/\b\w/g, l => l.toUpperCase()) // Mettre en majuscule la première lettre de chaque mot
            .trim();
    }
}

module.exports = PDFUtils;