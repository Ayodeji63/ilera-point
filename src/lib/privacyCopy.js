export const CONSENT_NOTICE_VERSION = "2026-09-15.v1";

const copy = {
  en: {
    title: "Choose how this visit is recorded.", intro: "Your choice will not affect your care.",
    voice: "Voice transcription", voiceBody: "To use voice intake, short microphone clips are sent securely to Sahara to become text. Gemini structures that text for clinician review. You can correct the transcript and final summary.",
    video: "Optional visit video", videoBody: "If you agree, the full visit is recorded for an authorised clinician. No AI watches the video. It is deleted after the clinic's configured retention period.",
    privacy: "Your health record is kept for clinical care. Access is logged. Ask the clinic to access, correct, withdraw optional consent, or request deletion where the law allows.",
    research: "Allow a de-identified copy to be considered for approved speech-quality research. This is optional and is not required for care.",
    withVideo: "Use voice and record video", voiceOnly: "Use voice without video", version: "Privacy notice",
    quality: "Speech recognition is still being evaluated for this language. Check every important symptom, medicine, number, and ‘no’ before sending.",
  },
  yo: {
    title: "Yan bí a ṣe máa gba ìbẹ̀wò yìí sílẹ̀.", intro: "Ohun tí o bá yàn kò ní dín ìtọju rẹ kù.",
    voice: "Yí ohùn padà sí ọ̀rọ̀", voiceBody: "Fún ìfọ̀rọ̀wérọ̀ ohùn, a máa fi àwòrán-ohùn kékeré ránṣẹ́ sí Sahara láti sọ ọ́ di ọ̀rọ̀. Gemini máa ṣètò ọ̀rọ̀ náà fún dókítà. O lè ṣàtúnṣe rẹ̀.",
    video: "Fídíò ìbẹ̀wò jẹ́ àṣàyàn", videoBody: "Tí o bá gbà, a ó gba gbogbo ìbẹ̀wò sílẹ̀ fún òṣìṣẹ́ ìlera tí a fọwọ́ sí. AI kì í wo fídíò náà.",
    privacy: "A pa àkọsílẹ̀ ìlera rẹ mọ́ fún ìtọju, a sì ń ṣàkọsílẹ̀ ẹni tó wọlé sí i. O lè béèrè fún àtúnṣe tàbí yí ìfọwọ́sí àṣàyàn padà.",
    research: "Mo gba kí ẹ̀dà tí kò ní orúkọ mi lè jẹ́ kíkà fún ìwádìí didara-ohùn tí a fọwọ́ sí. Èyí jẹ́ àṣàyàn.",
    withVideo: "Lo ohùn, kí o sì gba fídíò", voiceOnly: "Lo ohùn láì gba fídíò", version: "Ìfitónilétí àṣírí", quality: "Ìmọ̀ ohùn èdè yìí ṣì ń ṣe àyẹ̀wò. Ṣàyẹ̀wò àmì àìsàn, oogun, nọ́mbà àti gbogbo ‘rárá’."
  },
  pcm: {
    title: "Choose how we go record this visit.", intro: "Your choice no go affect your care.", voice: "Turn voice to text", voiceBody: "For voice intake, short microphone clips go Sahara to turn am to text. Gemini go arrange the text for clinician review. You fit correct am.", video: "Visit video na optional", videoBody: "If you agree, we go record the full visit for authorised clinician. AI no dey watch the video.", privacy: "We keep your health record for care and log who opens am. Ask the clinic to correct am or withdraw optional consent.", research: "Allow de-identified copy for approved speech-quality research. E no compulsory for care.", withVideo: "Use voice and record video", voiceOnly: "Use voice without video", version: "Privacy notice", quality: "Voice recognition for this language still dey evaluation. Check symptoms, medicine, numbers and every ‘no’ before you send."
  },
  ha: {
    title: "Zaɓi yadda za a adana wannan ziyarar.", intro: "Zaɓinka ba zai shafi kulawarka ba.", voice: "Mayar da murya zuwa rubutu", voiceBody: "Don amfani da murya, ana aika gajerun sauti zuwa Sahara domin zama rubutu. Gemini yana tsara rubutun domin ma'aikacin lafiya ya duba. Za ka iya gyara shi.", video: "Bidiyon ziyara na zaɓi ne", videoBody: "Idan ka yarda, za a ɗauki cikakken bidiyo domin ma'aikacin lafiya da aka amince da shi. AI ba ya kallon bidiyon.", privacy: "Ana adana bayanan lafiyarka domin kulawa kuma ana rubuta duk wanda ya buɗe su. Za ka iya neman gyara ko janye yardar zaɓi.", research: "A ba da damar amfani da kwafin da ba ya ɗauke da sunana don ingantaccen binciken murya. Wannan ba dole ba ne.", withVideo: "Yi amfani da murya da bidiyo", voiceOnly: "Yi amfani da murya ba tare da bidiyo ba", version: "Sanarwar sirri", quality: "Har yanzu ana gwada fahimtar wannan yare. Duba alamomi, magunguna, lambobi da duk amsar ‘a'a’."
  },
  ig: {
    title: "Họrọ otu a ga-esi dekọọ nleta a.", intro: "Nhọrọ gị agaghị emetụta nlekọta gị.", voice: "Gbanwee olu ka ọ bụrụ ederede", voiceBody: "Iji olu, a na-eziga obere ụda na Sahara ka ọ bụrụ ederede. Gemini na-ahazi ederede ahụ ka onye ahụike nyochaa. Ị nwere ike idozi ya.", video: "Vidio nleta bụ nhọrọ", videoBody: "Ọ bụrụ na ị kweta, a ga-edekọ nleta niile maka onye ahụike enyere ikike. AI anaghị ele vidio ahụ.", privacy: "A na-echekwa ndekọ ahụike gị maka nlekọta ma na-edekọ onye meghere ya. Ị nwere ike ịrịọ ndozi ma ọ bụ wepụ nkwenye nhọrọ.", research: "Kwe ka e jiri oyiri na-enweghị njirimara m mee nyocha ogo olu akwadoro. Nke a abụghị iwu maka nlekọta.", withVideo: "Jiri olu ma dekọọ vidio", voiceOnly: "Jiri olu na-enweghị vidio", version: "Ọkwa nzuzo", quality: "A ka na-enyocha nghọta olu asụsụ a. Lelee mgbaàmà, ọgwụ, ọnụọgụ na ‘mba’ niile."
  },
};

export function privacyCopy(languageCode) {
  return copy[languageCode] || copy.en;
}
