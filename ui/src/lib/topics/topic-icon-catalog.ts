import type { Component } from 'svelte';
import { isValidTopicIconId, type TopicIconId } from '@wartezimmer/domain';
import {
  Activity,
  Ambulance,
  Baby,
  Bandage,
  Bone,
  Brain,
  BriefcaseMedical,
  CalendarCheck,
  CalendarHeart,
  CalendarPlus,
  ClipboardList,
  ClipboardPlus,
  Clock,
  Cross,
  Dna,
  Droplet,
  Ear,
  Eye,
  FileHeart,
  FileText,
  FlaskConical,
  HandHeart,
  HandHelping,
  HeartHandshake,
  HeartPulse,
  Hospital,
  MessageCircle,
  Microscope,
  Phone,
  Pill,
  PillBottle,
  Radiation,
  Scan,
  ScanHeart,
  Scissors,
  ShieldPlus,
  Smile,
  Speech,
  Stethoscope,
  Syringe,
  Tablets,
  TestTubes,
  Thermometer,
  UserRound,
  Users,
  Accessibility,
} from '@lucide/svelte';

export type { TopicIconId };

type TopicIconEntry = {
  id: TopicIconId;
  label: string;
  component: Component<{ size?: number | string; strokeWidth?: number | string }>;
};

export const TOPIC_ICON_CATALOG: TopicIconEntry[] = [
  { id: 'stethoscope', label: 'Allgemeinmedizin', component: Stethoscope },
  { id: 'heart-pulse', label: 'Herz / Kardiologie', component: HeartPulse },
  { id: 'activity', label: 'Behandlung / Verlauf', component: Activity },
  { id: 'syringe', label: 'Injektion / Impfung', component: Syringe },
  { id: 'droplet', label: 'Blut / Labor', component: Droplet },
  { id: 'test-tubes', label: 'Labor / Proben', component: TestTubes },
  { id: 'flask-conical', label: 'Analyse', component: FlaskConical },
  { id: 'microscope', label: 'Diagnostik', component: Microscope },
  { id: 'scan', label: 'Bildgebung / Röntgen', component: Scan },
  { id: 'scan-heart', label: 'Herzdiagnostik', component: ScanHeart },
  { id: 'radiation', label: 'Strahlendiagnostik', component: Radiation },
  { id: 'pill', label: 'Rezept / Medikament', component: Pill },
  { id: 'pill-bottle', label: 'Dauermedikation', component: PillBottle },
  { id: 'tablets', label: 'Medikamentenplan', component: Tablets },
  { id: 'bandage', label: 'Wundversorgung', component: Bandage },
  { id: 'thermometer', label: 'Fieber / Akut', component: Thermometer },
  { id: 'cross', label: 'Akute Hilfe', component: Cross },
  { id: 'smile', label: 'Zahnarzt', component: Smile },
  { id: 'scissors', label: 'Chirurgie / OP', component: Scissors },
  { id: 'bone', label: 'Orthopädie', component: Bone },
  { id: 'brain', label: 'Neurologie', component: Brain },
  { id: 'dna', label: 'Genetik / Labor', component: Dna },
  { id: 'eye', label: 'Augenheilkunde', component: Eye },
  { id: 'ear', label: 'HNO', component: Ear },
  { id: 'baby', label: 'Kinder / Jugend', component: Baby },
  { id: 'accessibility', label: 'Mobilität / Reha', component: Accessibility },
  { id: 'hand-helping', label: 'Pflege / Unterstützung', component: HandHelping },
  { id: 'hand-heart', label: 'Fürsorge / Betreuung', component: HandHeart },
  { id: 'hospital', label: 'Station / Klinik', component: Hospital },
  { id: 'briefcase-medical', label: 'Arztkoffer / Hausbesuch', component: BriefcaseMedical },
  { id: 'ambulance', label: 'Notfall / Akut', component: Ambulance },
  { id: 'calendar-check', label: 'Termin (habe)', component: CalendarCheck },
  { id: 'calendar-plus', label: 'Termin (brauche)', component: CalendarPlus },
  { id: 'calendar-heart', label: 'Vorsorgetermin', component: CalendarHeart },
  { id: 'clock', label: 'Offene Sprechstunde', component: Clock },
  { id: 'clipboard-list', label: 'Formular / Befund', component: ClipboardList },
  { id: 'clipboard-plus', label: 'Anamnese / Neuaufnahme', component: ClipboardPlus },
  { id: 'file-text', label: 'Unterlagen', component: FileText },
  { id: 'file-heart', label: 'Herzbefund / Überweisung', component: FileHeart },
  { id: 'message-circle', label: 'Rückruf / Nachricht', component: MessageCircle },
  { id: 'phone', label: 'Telefon', component: Phone },
  { id: 'user-round', label: 'Einzelpatient', component: UserRound },
  { id: 'users', label: 'Mehrere / Gruppe', component: Users },
  { id: 'heart-handshake', label: 'Beratung / Gespräch', component: HeartHandshake },
  { id: 'speech', label: 'Therapie / Gespräch', component: Speech },
  { id: 'shield-plus', label: 'Vorsorge / Schutz', component: ShieldPlus },
];

const ICON_BY_ID = new Map(TOPIC_ICON_CATALOG.map((entry) => [entry.id, entry.component]));

/** True when the id is allowlisted and has a Lucide component in the UI catalog. */
export function isKnownTopicIconId(value: string | null | undefined): value is TopicIconId {
  return typeof value === 'string' && isValidTopicIconId(value) && ICON_BY_ID.has(value);
}

export function resolveTopicIconComponent(iconId: string | null | undefined) {
  if (!iconId || !isKnownTopicIconId(iconId)) {
    return null;
  }
  return ICON_BY_ID.get(iconId) ?? null;
}

export function topicInitialLetter(label: string): string {
  const trimmed = label.trim();
  if (trimmed.length === 0) {
    return '?';
  }
  return trimmed.charAt(0).toUpperCase();
}
