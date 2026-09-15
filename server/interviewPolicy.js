export const MAX_INTERVIEW_TURNS = 12;

const QUESTIONS = {
  en: {
    chief: ["Please briefly tell me the main health problem.", "What is the main problem you want the clinician to know about?"],
    onset: ["When did this problem start?", "About how long have you had this problem?"],
    symptoms: ["What other symptoms have you noticed?", "Besides the main problem, what else have you felt?"],
    negatives: ["Have you had trouble breathing, chest pain, fainting, severe bleeding, or a seizure?", "Please say whether you have had any breathing trouble, chest pain, fainting, heavy bleeding, or seizures."],
    medication: ["What medicines have you taken for this problem, or none?", "Please tell me the medicine name and amount you took, or say none."],
    other: ["What else should the clinician know?", "Is there anything important about this problem we have not covered?"],
  },
  yo: {
    chief: ["Jọ̀wọ́, sọ ìṣòro àìlera pàtàkì tó mú ọ wá.", "Kí ni ìṣòro pàtàkì tí o fẹ́ kí dókítà mọ̀?"],
    onset: ["Ìgbà wo ni ìṣòro yìí bẹ̀rẹ̀?", "Ó ti pé tó ìgbà wo tí ìṣòro yìí ti bẹ̀rẹ̀?"],
    symptoms: ["Àwọn àmì àìsàn mìíràn wo ni o ti rí?", "Yàtọ̀ sí ìṣòro pàtàkì náà, kí ni ohun mìíràn tí o ń ní?"],
    negatives: ["Ṣé o ní ìṣòro mímí, ìrora àyà, dídákú, ẹ̀jẹ̀ púpọ̀, tàbí gírigíri?", "Jọ̀wọ́ sọ bóyá o ní ìṣòro mímí, ìrora àyà, dídákú, ẹ̀jẹ̀ púpọ̀, tàbí gírigíri."],
    medication: ["Oògùn wo ni o ti lò fún ìṣòro yìí, tàbí kò sí?", "Jọ̀wọ́ sọ orúkọ oògùn àti iye tí o lò, tàbí sọ pé o kò lo oògùn kankan."],
    other: ["Kí ni ohun mìíràn tí dókítà yẹ kí ó mọ̀?", "Ṣé ohun pàtàkì mìíràn wà tí a kò tíì béèrè?"],
  },
  pcm: {
    chief: ["Abeg, tell me the main sickness wey bring you come.", "Which health problem you want make the clinician know?"],
    onset: ["When this problem start?", "How long you don get this problem?"],
    symptoms: ["Which other signs you notice?", "Apart from this problem, wetin else you dey feel?"],
    negatives: ["You get trouble to breathe, chest pain, fainting, heavy bleeding, or seizure?", "Abeg tell me if breathing hard, your chest dey pain, you faint, bleed plenty, or get seizure."],
    medication: ["Which medicine you take for this problem, or none?", "Tell me the medicine name and how much you take, or say none."],
    other: ["Wetin else the clinician suppose know?", "Any important thing about this problem we never ask?"],
  },
  ha: {
    chief: ["Don Allah, mene ne babban matsalar lafiyar da ta kawo ku?", "Wace matsalar lafiya kuke so likita ya sani?"],
    onset: ["Yaushe wannan matsalar ta fara?", "Har yaushe kuke fama da wannan matsalar?"],
    symptoms: ["Waɗanne sauran alamomi kuka lura da su?", "Bayan babban matsalar, mene ne kuma kuke ji?"],
    negatives: ["Kuna da wahalar numfashi, ciwon ƙirji, suma, zubar jini mai yawa, ko farfaɗiya?", "Don Allah ku faɗa ko kuna da wahalar numfashi, ciwon ƙirji, suma, zubar jini mai yawa, ko farfaɗiya."],
    medication: ["Wane magani kuka sha don wannan matsalar, ko babu?", "Ku faɗi sunan maganin da adadin da kuka sha, ko ku ce babu."],
    other: ["Mene ne kuma ya kamata likita ya sani?", "Akwai wani muhimmin abu da ba mu tambaya ba?"],
  },
  ig: {
    chief: ["Biko, gwa m isi nsogbu ahụike wetara gị.", "Kedu nsogbu ahụike ịchọrọ ka dọkịta mara?"],
    onset: ["Kedu mgbe nsogbu a malitere?", "Ogologo oge ole ka ị nwere nsogbu a?"],
    symptoms: ["Kedu mgbaàmà ndị ọzọ ị hụrụ?", "E wezụga isi nsogbu ahụ, kedu ihe ọzọ ị na-eche?"],
    negatives: ["Ị nwere nsogbu iku ume, mgbu obi, ịtụbọ, nnukwu ọbara ọgbụgba, ma ọ bụ ọdịdọ?", "Biko gwa m ma iku ume na-esiri gị ike, obi na-afụ gị ụfụ, ị tụbọ, ọbara na-agba gị nke ukwuu, ma ọ bụ ị nwere ọdịdọ."],
    medication: ["Kedu ọgwụ ị ṅụrụ maka nsogbu a, ma ọ bụ na ị ṅụghị ọgwụ ọ bụla?", "Gwa m aha ọgwụ ahụ na ole ị ṅụrụ, ma ọ bụ kwuo na ọ dịghị."],
    other: ["Kedu ihe ọzọ dọkịta kwesịrị ịma?", "Ọ nwere ihe dị mkpa anyị na-ajụbeghị?"],
  },
};

function normalizeQuestion(value = "") {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[\p{L}\p{N}]+/gu)?.join(" ") || "";
}

export function questionTopic(question = "") {
  const value = normalizeQuestion(question);
  if (/breath|chest|faint|bleed|seiz|isoro mimi|irora aya|didaku|eje pupo|girigiri|wahalar numfashi|ciwon kirji|zubar jini|farfadiya|iku ume|mgbu obi|ododo/.test(value)) return "negatives";
  if (/medicin|medication|drug|dose|dosage|oogun|magani|ogwu/.test(value)) return "medication";
  if (/when.*start|how long|did.*start|igba wo|bere|yaushe|har yaushe|kedu mgbe|ogologo oge/.test(value)) return "onset";
  if (/other symptom|other sign|what else.*feel|anything else|ami aisan miiran|aisan miiran|aisan mii|ohun miiran|sauran alamomi|mgbaama ndi ozo|wetin else|which other sign/.test(value)) return "symptoms";
  if (/main health|main problem|main concern|health problem|sickness.*bring|isoro ailera pataki|babban matsalar|isi nsogbu/.test(value)) return "chief";
  return "other";
}

export function isExplicitDenial(answer = "") {
  const value = normalizeQuestion(answer);
  return /\b(no|none|nothing|no other|not any)\b/.test(value)
    || /\bko si\b|\brara\b|\bbabu\b|\ba a\b|\bo dighi\b|\bodighi\b|\bno get\b/.test(value);
}

export function questionsAreSimilar(left, right) {
  const a = new Set(normalizeQuestion(left).split(" ").filter(Boolean));
  const b = new Set(normalizeQuestion(right).split(" ").filter(Boolean));
  if (!a.size || !b.size) return false;
  const shared = [...a].filter((word) => b.has(word)).length;
  return shared / Math.min(a.size, b.size) >= 0.72;
}

function topicForMissing(stillMissing = []) {
  for (const item of stillMissing) {
    const value = String(item).toLowerCase();
    if (/medication|medicine|drug|dose|dosage/.test(value)) return "medication";
    if (/onset|start|duration|how long|when/.test(value)) return "onset";
    if (/negative|red flag|breath|chest|bleed|seiz|conscious|faint/.test(value)) return "negatives";
    if (/associated|other symptom|symptom review/.test(value)) return "symptoms";
    if (/chief|complaint|main problem|main concern/.test(value)) return "chief";
  }
  return "other";
}

function missingIsTopic(item, topic) {
  return topicForMissing([item]) === topic;
}

// Empty associated symptoms is a complete answer when the patient explicitly
// said there are none. The model must not turn an empty array back into a prompt
// to ask the same topic indefinitely.
export function reconcileStillMissing(record, turns = []) {
  const missing = Array.isArray(record?.still_missing) ? record.still_missing : [];
  const symptomsRecorded = Array.isArray(record?.associated_symptoms) && record.associated_symptoms.length > 0;
  const symptomsDenied = turns.some((turn) => questionTopic(turn.question_asked) === "symptoms" && isExplicitDenial(turn.transcript));
  const hasChief = Array.isArray(record?.chief_complaints) && record.chief_complaints.length > 0;
  const hasOnset = Boolean(String(record?.onset || "").trim());
  const hasMedicationHistory = Boolean(String(record?.medication_history || "").trim());
  return missing.filter((item) => {
    const topic = topicForMissing([item]);
    if (topic === "chief" && hasChief) return false;
    if (topic === "onset" && hasOnset) return false;
    if (topic === "medication" && hasMedicationHistory) return false;
    if (topic === "symptoms" && (symptomsRecorded || symptomsDenied)) return false;
    return true;
  });
}

export function selectNextQuestion(candidate, turns, stillMissing, languageCode = "en") {
  const previousQuestions = turns.map((turn) => turn.question_asked);
  const repeated = previousQuestions.some((question) => questionsAreSimilar(candidate, question));
  const tooLong = candidate.trim().length > 150 || (candidate.match(/\?/g) || []).length > 1;
  const expectedTopic = topicForMissing(stillMissing);
  const candidateTopic = questionTopic(candidate);
  // When a known clinical field is missing, an unclassified creative rewording
  // is not safe to pass through: it may be another version of an answered topic.
  const wrongTopic = expectedTopic !== "other" && candidateTopic !== expectedTopic;
  if (candidate.trim() && !repeated && !tooLong && !wrongTopic) return candidate.trim();

  const language = QUESTIONS[languageCode] ? languageCode : "en";
  const variants = QUESTIONS[language][topicForMissing(stillMissing)];
  return variants[turns.length % variants.length];
}

export function shouldCompleteInterview(turnCount, stillMissing) {
  return turnCount >= MAX_INTERVIEW_TURNS || (turnCount >= 2 && Array.isArray(stillMissing) && stillMissing.length === 0);
}
