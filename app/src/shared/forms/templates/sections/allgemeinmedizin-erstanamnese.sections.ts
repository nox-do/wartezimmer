import type { FormSectionLayout } from '../../template-types.js';

/** Shared by portal (via API) and form PDF rendering. */
export const allgemeinmedizinErstanamneseSections: FormSectionLayout[] = [
  {
    titleKey: 'portal.anamneseSectionMasterData',
    pdfTitle: 'Stammdaten',
    fieldIds: ['fullName', 'birthDate', 'contactPhone', 'contactEmail'],
  },
  {
    titleKey: 'portal.anamneseSectionConcern',
    pdfTitle: 'Aktuelles Anliegen',
    fieldIds: ['mainConcern', 'symptomSince', 'painScale'],
  },
  {
    titleKey: 'portal.anamneseSectionHistory',
    pdfTitle: 'Medizinische Vorgeschichte',
    fieldIds: ['knownDiagnoses', 'pastOperations', 'currentMedication'],
  },
  {
    titleKey: 'portal.anamneseSectionAllergiesFamily',
    pdfTitle: 'Allergien und Familie',
    fieldIds: [
      'knownAllergies',
      'allergyReactionNotes',
      'familyHistoryCardio',
      'familyHistoryDiabetes',
      'familyHistoryCancer',
    ],
  },
  {
    titleKey: 'portal.anamneseSectionLifestyle',
    pdfTitle: 'Lebensstil',
    fieldIds: [
      'smoker',
      'cigarettesPerDay',
      'alcoholPerWeek',
      'substanceUse',
      'sleepQuality',
      'digestiveOrUrinaryIssues',
    ],
  },
  {
    titleKey: 'portal.anamneseSectionMore',
    pdfTitle: 'Weitere Angaben',
    fieldIds: [
      'mentalHealthHistory',
      'heightCm',
      'weightKg',
      'pregnant',
      'socialSituation',
      'careLevelOrSupportNeeds',
      'vaccinationOrInfectionNotes',
      'patientGoals',
    ],
  },
];
