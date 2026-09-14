const GUIDANCE = {
  en: {
    pulse: {
      title: "Check your pulse and oxygen first.",
      intro: "This check measures your heart rate. Oxygen level is shown only after this device has been clinically calibrated.",
      instruction: "Place one relaxed finger over the sensor's red light. Keep your hand resting and do not press hard.",
      voice: "We will check your pulse first. Place one relaxed finger over the red light on the sensor. Keep your hand still and do not press hard. Press Start pulse check when you are ready.",
      start: "Start pulse check",
      retry: "Try pulse again",
      continue: "Continue to temperature",
      skip: "Continue without pulse",
      replay: "Hear the instructions again",
    },
    temperature: {
      title: "Now check your temperature.",
      intro: "This is a separate check. The sensor takes several readings over about three seconds.",
      instruction: "Remove your finger. Hold your forehead 2-3 cm from the temperature sensor and face it directly.",
      voice: "Now we will check your temperature. Remove your finger from the pulse sensor. Hold your forehead two to three centimetres from the temperature sensor and face it directly. Press Start temperature check when you are ready.",
      start: "Start temperature check",
      retry: "Try temperature again",
      continue: "Continue to health questions",
      skip: "Continue without temperature",
      replay: "Hear the instructions again",
    },
  },
  yo: {
    pulse: {
      title: "Jẹ́ ká kọ́kọ́ wọn ìlù ọkàn àti oxygen rẹ.",
      intro: "A ó wọn bí ọkàn rẹ ṣe ń lù. A máa fi oxygen hàn lẹ́yìn tí a bá ti calibrate sensor yìí pẹ̀lú ẹ̀rọ ìtọ́kasí.",
      instruction: "Fi ìka kan bo iná pupa lórí sensor. Jẹ́ kí ọwọ́ rẹ balẹ̀, má sì tẹ̀ ẹ́ mọ́lẹ̀.",
      voice: "Jẹ́ ká kọ́kọ́ wọn ìlù ọkàn rẹ. Fi ìka kan bo iná pupa lórí sensor. Jẹ́ kí ọwọ́ rẹ balẹ̀, má sì tẹ̀ ẹ́ mọ́lẹ̀. Tẹ Bẹ̀rẹ̀ ìwọ̀n nígbà tí o bá ti ṣetán.",
      start: "Bẹ̀rẹ̀ ìwọ̀n",
      retry: "Tún ìwọ̀n pulse ṣe",
      continue: "Lọ sí temperature",
      skip: "Tẹ̀síwájú láìwọn pulse",
      replay: "Gbọ́ ìtọ́sọ́nà lẹ́ẹ̀kan síi",
    },
    temperature: {
      title: "Ní báyìí, jẹ́ ká wọn temperature rẹ.",
      intro: "Ìwọ̀n yìí yàtọ̀. Sensor yóò ka temperature ní ọ̀pọ̀ ìgbà fún ìṣẹ́jú-àáyá díẹ̀.",
      instruction: "Yọ ìka rẹ kúrò lórí pulse sensor. Mu iwájú orí rẹ sí 2-3 cm sí temperature sensor, kí o sì dojú kọ ọ́ tààrà.",
      voice: "Ní báyìí, jẹ́ ká wọn temperature rẹ. Yọ ìka rẹ kúrò lórí pulse sensor. Mu iwájú orí rẹ sí centimita méjì sí mẹ́ta sí temperature sensor, kí o sì dojú kọ ọ́ tààrà. Tẹ Bẹ̀rẹ̀ temperature nígbà tí o bá ti ṣetán.",
      start: "Bẹ̀rẹ̀ temperature",
      retry: "Tún temperature ṣe",
      continue: "Lọ sí àwọn ìbéèrè ìlera",
      skip: "Tẹ̀síwájú láìwọn temperature",
      replay: "Gbọ́ ìtọ́sọ́nà lẹ́ẹ̀kan síi",
    },
  },
  ig: {
    pulse: {
      title: "Ka anyị buru ụzọ tụọ mkpụrụ obi na oxygen gị.",
      intro: "Nke a na-atụ etu obi gị si akụ. A ga-egosi oxygen naanị mgbe ejiri ngwaọrụ ntụaka hazie sensor a.",
      instruction: "Debe otu mkpịsị aka n'elu ọkụ uhie nke sensor. Mee ka aka gị zuru ike, etinyekwala ya ike.",
      voice: "Ka anyị buru ụzọ tụọ mkpụrụ obi gị. Debe otu mkpịsị aka n'elu ọkụ uhie nke sensor. Mee ka aka gị zuru ike, etinyekwala ya ike. Pịa Bido nyocha mgbe ị dị njikere.",
      start: "Bido nyocha",
      retry: "Tụọ pulse ọzọ",
      continue: "Gaa na temperature",
      skip: "Gaa n'ihu na-enweghị pulse",
      replay: "Nụrụ ntụziaka ọzọ",
    },
    temperature: {
      title: "Ugbu a, tụọ temperature gị.",
      intro: "Nke a bụ nyocha dị iche. Sensor ga-agụ temperature ọtụtụ ugboro n'ime sekọnd ole na ole.",
      instruction: "Wepụ mkpịsị aka gị. Debe ọkpọiso gị 2-3 cm site na temperature sensor ma chee ya ihu kpọmkwem.",
      voice: "Ugbu a, ka anyị tụọ temperature gị. Wepụ mkpịsị aka gị na pulse sensor. Debe ọkpọiso gị sentimita abụọ ruo atọ site na temperature sensor ma chee ya ihu kpọmkwem. Pịa Bido temperature mgbe ị dị njikere.",
      start: "Bido temperature",
      retry: "Tụọ temperature ọzọ",
      continue: "Gaa na ajụjụ ahụike",
      skip: "Gaa n'ihu na-enweghị temperature",
      replay: "Nụrụ ntụziaka ọzọ",
    },
  },
};

export function vitalsGuidance(language, stage) {
  return (GUIDANCE[language] || GUIDANCE.en)[stage];
}

export function hasLocalizedVitalsGuidance(language) {
  return language === "yo" || language === "ig";
}
