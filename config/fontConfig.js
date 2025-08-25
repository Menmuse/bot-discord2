/**
 * Configuration des polices par modèle PDF
 * 
 * Ce fichier permet de définir quelle police utiliser pour chaque modèle PDF.
 * Les polices doivent être placées dans le dossier assets/fonts/ au format .ttf
 * 
 * Structure:
 * {
 *   'nom_du_modele': {
 *     font: 'nom_de_la_police', // nom du fichier .ttf sans l'extension
 *     fontSize: 12, // taille de police par défaut (optionnel)
 *     color: [0, 0, 0] // couleur RGB (optionnel, noir par défaut)
 *   }
 * }
 */

module.exports = {
    // Configuration par défaut (utilisée si aucune configuration spécifique n'est trouvée)
    default: {
        font: null, // null = utiliser les polices par défaut de pdf-lib
        fontSize: 12,
        color: [0, 0, 0], // noir
        fontWeight: 'normal' // 'normal' ou 'bold'
    },

    // Exemple pour un nouveau modèle
    'EXEMPLE': {
        font: 'OpenSans', // Nécessite OpenSans.ttf dans assets/fonts/
        fontSize: 13,
        color: [0, 0, 0], // noir
        fontWeight: 'normal' // Texte normal (pas en gras)
    }

    /**
     * Pour ajouter un nouveau modèle:
     * 1. Ajoutez une entrée avec le nom exact du fichier PDF (sans .pdf)
     * 2. Spécifiez le nom de la police (nom du fichier .ttf sans extension)
     * 3. Placez le fichier .ttf dans assets/fonts/
     * 4. Redémarrez le bot
     * 
     * Polices recommandées:
     * - Arial: Police claire et professionnelle
     * - TimesNewRoman: Police classique pour documents officiels
     * - Helvetica: Police moderne et lisible
     * - Roboto: Police Google, moderne
     * - OpenSans: Police open source, très lisible
     */
};