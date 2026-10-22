import type { PracticeTopicSummary } from "./types";

export const topicGroups = [
  { id: "signals", title: "Segnali", tone: "yellow", icon: "signals", codes: ["4056", "4149", "4185", "4193", "4236", "4266", "4326", "4348", "4373"] },
  { id: "road", title: "Circolazione", tone: "blue", icon: "road", codes: ["4050", "4393", "4408", "4447", "4462", "4506", "4529"] },
  { id: "car", title: "Veicolo e viaggio", tone: "green", icon: "car", codes: ["4570", "4587", "4685", "4715"] },
  { id: "safety", title: "Sicurezza", tone: "pink", icon: "safety", codes: ["4604", "4635", "4656"] },
  { id: "licence", title: "Patente e RCA", tone: "orange", icon: "licence", codes: ["4622", "4716"] },
] as const;

const titles: Record<string, string> = {
  "4050": "Strada e veicoli", "4056": "Segnali di pericolo", "4149": "Segnali di divieto", "4185": "Segnali di obbligo",
  "4193": "Segnali di precedenza", "4236": "Segnaletica orizzontale", "4266": "Semafori e agenti", "4326": "Segnali di indicazione",
  "4348": "Cantieri e segnali temporanei", "4373": "Pannelli integrativi", "4393": "Velocità e passaggi a livello",
  "4408": "Distanza di sicurezza", "4447": "Circolazione e manovre", "4462": "Incroci e precedenze", "4506": "Sorpasso",
  "4529": "Fermata e sosta", "4570": "Autostrade, carico e traino", "4587": "Luci e spie", "4604": "Cinture, casco e protezioni",
  "4622": "Patente e documenti", "4635": "Incidenti e prevenzione", "4656": "Salute e primo soccorso",
  "4685": "Ambiente e consumi", "4715": "Veicolo e manutenzione", "4716": "Responsabilità e assicurazione",
};

export function topicTitle(topic: Pick<PracticeTopicSummary, "code" | "name">): string {
  return titles[topic.code] ?? (topic.name.split(";")[0].length <= 50 ? topic.name.split(";")[0] : `Argomento ${topic.code}`);
}

export interface TopicGroup {
  id: string; title: string; tone: string; icon: string; topics: PracticeTopicSummary[];
}

/** Every usable topic appears exactly once; a future catalogue cannot silently lose new codes. */
export function groupPracticeTopics(topics: PracticeTopicSummary[]): TopicGroup[] {
  const used = new Set<string>();
  const groups: TopicGroup[] = topicGroups.map(group => ({ ...group, topics: group.codes.flatMap(code => {
    const topic = topics.find(item => item.code === code && !used.has(item.id));
    if (!topic) return [];
    used.add(topic.id);
    return [topic];
  }) })).filter(group => group.topics.length > 0);
  const remaining = topics.filter(topic => !used.has(topic.id));
  if (remaining.length) groups.push({ id: "other", title: "Altri argomenti", tone: "blue", icon: "training", topics: remaining });
  return groups;
}
