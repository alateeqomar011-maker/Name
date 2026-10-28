"""Bilingual (Arabic / English) explanations for the coach's findings. Rulings follow the riwayah
of Hafs ʿan ʿAsim by way of ash-Shatibiyyah, as in the standard Madinah mushaf."""

RULES = {
    "missed_word": {
        "en": "This word was not heard in your recitation.",
        "ar": "لم تُسمع هذه الكلمة في تلاوتك.",
        "tip_en": "Listen to the reference for this ayah, then recite it again slowly, word by word.",
        "tip_ar": "استمع إلى القارئ المرجعي في هذه الآية، ثم أعد تلاوتها ببطء كلمةً كلمة.",
    },
    "extra_word": {
        "en": "Something extra was heard here that is not in the text.",
        "ar": "سُمع هنا شيء زائد ليس في النص.",
        "tip_en": "Check that you did not repeat or add a word. Repeating to correct yourself is fine — just restart the phrase cleanly.",
        "tip_ar": "تأكد أنك لم تكرر كلمة أو تزد عليها. لا بأس بالإعادة للتصحيح، لكن أعد الجملة من بدايتها.",
    },
    "substituted_word": {
        "en": "This word sounded like a different word.",
        "ar": "بدت هذه الكلمة وكأنها كلمة أخرى.",
        "tip_en": "Compare the letters carefully with the mushaf text and the reference recitation.",
        "tip_ar": "قارن الحروف بدقة مع نص المصحف وتلاوة القارئ المرجعي.",
    },
    "unclear_word": {
        "en": "The recogniser was unsure about this word. This can be a pronunciation issue — or only background noise.",
        "ar": "لم يتمكن النظام من تمييز هذه الكلمة بثقة. قد يكون السبب في النطق أو مجرد ضجيج.",
        "tip_en": "Listen to the reference and compare. If you are not sure, ask a qualified teacher to listen.",
        "tip_ar": "استمع إلى القارئ المرجعي وقارن. وإن لم تتأكد فاعرض تلاوتك على معلم متقن.",
    },
    "skipped_ayah": {
        "en": "This whole ayah seems to be missing from the recording.",
        "ar": "يبدو أن هذه الآية كاملةً غير موجودة في التسجيل.",
        "tip_en": "Make sure you recite every ayah of the selected range in order.",
        "tip_ar": "احرص على تلاوة جميع آيات المقطع المحدد بالترتيب.",
    },
    "madd_short": {
        "en": "This madd sounded shorter than required.",
        "ar": "بدا هذا المد أقصر من المطلوب.",
        "tip_en": "Hold the long vowel steadily for the full count. Counting on your fingers at an even pace helps.",
        "tip_ar": "أطل حرف المد بثبات حتى يكتمل مقداره، ويساعدك العدّ على الأصابع بإيقاع ثابت.",
    },
    "madd_long": {
        "en": "This madd sounded noticeably longer than its usual length.",
        "ar": "بدا هذا المد أطول بوضوح من مقداره المعتاد.",
        "tip_en": "Keep madd lengths consistent: the same type of madd should have the same length throughout your recitation.",
        "tip_ar": "حافظ على تسوية المدود: المد من النوع نفسه يكون بالمقدار نفسه في التلاوة كلها.",
    },
    "ghunnah_short": {
        "en": "The ghunnah (nasal sound) here sounded short or weak.",
        "ar": "بدت الغنة هنا قصيرة أو ضعيفة.",
        "tip_en": "Let the sound flow through the nose and hold it for about two counts before moving on.",
        "tip_ar": "أخرج الصوت من الخيشوم وأمسكه بمقدار حركتين تقريبًا قبل الانتقال.",
    },
    "qalqalah_missing": {
        "en": "The qalqalah (echoing bounce) was not clearly heard.",
        "ar": "لم تظهر القلقلة بوضوح.",
        "tip_en": "On ق ط ب ج د with sukun, close firmly on the letter and release it with a light bounce — without adding a vowel.",
        "tip_ar": "عند (ق ط ب ج د) الساكنة، أحكم الاعتماد على المخرج ثم أطلقه بنبرة خفيفة دون أن تحرّك الحرف.",
    },
    "pace_rushed": {
        "en": "The recitation sounds rushed for tartil.",
        "ar": "تبدو التلاوة سريعة بالنسبة للترتيل.",
        "tip_en": "Slow down so every letter gets its full right (haqq) and every rule its due (mustahaqq).",
        "tip_ar": "تمهّل حتى تعطي كل حرف حقه ومستحقه.",
    },
    "waqf_midword": {
        "en": "A pause was detected inside this word.",
        "ar": "رُصد توقف داخل هذه الكلمة.",
        "tip_en": "Do not stop in the middle of a word. If you run out of breath, restart from an appropriate place.",
        "tip_ar": "لا تقف في وسط الكلمة، وإن انقطع نفسك فابدأ من موضع مناسب.",
    },
}


# Step-by-step correction for each finding: listen, isolate, rebuild, re-record.
STEPS = {
    "missed_word": {
        "en": ["Play the reference for this ayah and follow the words in the mushaf.",
               "Say the missing word alone three times, slowly.",
               "Recite the word together with the word before it, then the word after it.",
               "Recite the whole ayah again and record it."],
        "ar": ["شغّل تلاوة القارئ لهذه الآية وتابع الكلمات في المصحف.",
               "انطق الكلمة الناقصة وحدها ثلاث مرات ببطء.",
               "اقرأ الكلمة مع التي قبلها، ثم مع التي بعدها.",
               "أعد الآية كاملة وسجّلها."],
    },
    "extra_word": {
        "en": ["Listen to your recording at this point to hear what was added.",
               "Read the phrase from the mushaf with your finger under each word.",
               "If you need to correct yourself, go back to the start of the phrase rather than repeating one word.",
               "Record the ayah again in one flow."],
        "ar": ["استمع إلى تسجيلك في هذا الموضع لتعرف ما الذي زيد.",
               "اقرأ الجملة من المصحف مع وضع إصبعك تحت كل كلمة.",
               "إن احتجت إلى التصحيح فارجع إلى أول الجملة بدل تكرار كلمة واحدة.",
               "سجّل الآية مرة أخرى بنفَس متصل."],
    },
    "substituted_word": {
        "en": ["Play your word and then the reference word, one after the other.",
               "Compare letter by letter with the mushaf — look for a changed letter or vowel.",
               "Say the word slowly, letter by letter, paying attention to the articulation points shown.",
               "Join the letters at normal speed, then recite the ayah and record it."],
        "ar": ["شغّل كلمتك ثم كلمة القارئ واحدة بعد الأخرى.",
               "قارن حرفًا حرفًا مع المصحف، وابحث عن حرف أو حركة تغيّرت.",
               "انطق الكلمة ببطء حرفًا حرفًا مع الانتباه إلى المخارج المبيّنة.",
               "صِل الحروف بسرعتك المعتادة، ثم اقرأ الآية وسجّلها."],
    },
    "unclear_word": {
        "en": ["Play your word and the reference word one after the other.",
               "Check the recording conditions: a quiet room and the phone about 20 cm from your mouth.",
               "Say the word clearly with every letter from its articulation point.",
               "Record the ayah again; if the word is still unclear, ask a teacher to listen."],
        "ar": ["شغّل كلمتك وكلمة القارئ واحدة بعد الأخرى.",
               "تحقق من ظروف التسجيل: غرفة هادئة والهاتف على بعد نحو ٢٠ سم من فمك.",
               "انطق الكلمة بوضوح مع إخراج كل حرف من مخرجه.",
               "سجّل الآية مرة أخرى، وإن بقيت الكلمة غير واضحة فاعرضها على معلم."],
    },
    "skipped_ayah": {
        "en": ["Check the selected ayah range against what you recited.",
               "Listen to the reference for the missing ayah.",
               "Recite the range again from the first ayah, in order."],
        "ar": ["تحقق من أن نطاق الآيات المحدد يطابق ما تلوته.",
               "استمع إلى القارئ في الآية الناقصة.",
               "أعد تلاوة النطاق من أوله بالترتيب."],
    },
    "madd_short": {
        "en": ["Find the madd letter in the word (ا و ي or the small madd sign).",
               "Count the required length on your fingers at an even pace, saying the vowel steadily.",
               "Listen to how long the reference holds it, then hold yours just as long.",
               "Recite the word in its phrase and record it."],
        "ar": ["حدّد حرف المد في الكلمة (ا و ي أو علامة المد).",
               "عُدّ المقدار المطلوب على أصابعك بإيقاع ثابت مع إطالة الصوت باستواء.",
               "استمع إلى مقدار مدّ القارئ، ثم مدّ بالمقدار نفسه.",
               "اقرأ الكلمة في جملتها وسجّلها."],
    },
    "madd_long": {
        "en": ["Compare this madd with other madds of the same type in your recitation.",
               "Count the length on your fingers and stop at the count.",
               "Record the phrase again keeping every madd of this type equal."],
        "ar": ["قارن هذا المد بالمدود من النوع نفسه في تلاوتك.",
               "عُدّ المقدار على أصابعك وتوقف عند تمامه.",
               "سجّل الجملة مرة أخرى مع تسوية مدود هذا النوع."],
    },
    "ghunnah_short": {
        "en": ["Hold your nose lightly while saying the letter: you should feel the sound stop — that is the ghunnah.",
               "Hold the nasal sound for about two counts.",
               "Recite the word in its phrase and record it."],
        "ar": ["أمسك أنفك برفق أثناء نطق الحرف: ستشعر بانقطاع الصوت، وهذه هي الغنة.",
               "أمسك صوت الغنة بمقدار حركتين تقريبًا.",
               "اقرأ الكلمة في جملتها وسجّلها."],
    },
    "qalqalah_missing": {
        "en": ["Find the qalqalah letter (ق ط ب ج د) with sukun.",
               "Press firmly on the letter's articulation point, then release it with a light bounce.",
               "Do not add a vowel after it — the bounce is short and dry.",
               "Recite the word, then the ayah, and record it."],
        "ar": ["حدّد حرف القلقلة (ق ط ب ج د) الساكن.",
               "اعتمد على مخرج الحرف بقوة، ثم أطلقه بنبرة خفيفة.",
               "لا تضف حركة بعده، فالنبرة قصيرة وجافة.",
               "اقرأ الكلمة ثم الآية وسجّلها."],
    },
    "pace_rushed": {
        "en": ["Listen to the reference ayah and notice how long each madd lasts.",
               "Recite at about the reference's pace, giving every madd and ghunnah its count.",
               "Record again and compare the pace in the technique view."],
        "ar": ["استمع إلى الآية من القارئ ولاحظ مقدار كل مد.",
               "اقرأ بسرعة قريبة من سرعة القارئ مع إعطاء كل مد وغنة مقدارهما.",
               "سجّل مرة أخرى وقارن السرعة في عرض الأسلوب."],
    },
    "waqf_midword": {
        "en": ["Take a full breath before starting the ayah.",
               "If you must stop, finish the word first and stop on a sukun.",
               "Restart from the beginning of the word or phrase, then record again."],
        "ar": ["خذ نفَسًا كاملًا قبل بدء الآية.",
               "إن اضطررت إلى الوقف فأتمّ الكلمة وقف بالسكون.",
               "ابدأ من أول الكلمة أو الجملة، ثم سجّل مرة أخرى."],
    },
}

HUKM = {
    "madd-muttasil": {
        "en": "Obligatory connected madd (al-madd al-wajib al-muttasil): a madd letter followed by a hamza in the same word is stretched 4 or 5 counts.",
        "ar": "المد الواجب المتصل: حرف مد بعده همز في كلمة واحدة، ويُمد أربع أو خمس حركات.",
    },
    "madd-munfasil": {
        "en": "Permissible separated madd (al-madd al-jaʾiz al-munfasil): a madd letter at the end of a word and a hamza at the start of the next, stretched 4 or 5 counts in Hafs via ash-Shatibiyyah (2 counts is also read via other routes).",
        "ar": "المد الجائز المنفصل: حرف مد في آخر الكلمة وهمز في أول الكلمة التالية، ويُمد أربع أو خمس حركات لحفص من طريق الشاطبية (ويُقرأ بالقصر من طرق أخرى).",
    },
    "madd-lazim-kalimi-muthaqqal": {
        "en": "Necessary madd (al-madd al-lazim): a madd letter followed by a shaddah, as in ٱلضَّآلِّينَ — always 6 counts.",
        "ar": "المد اللازم الكلمي المثقل: حرف مد بعده حرف مشدد، مثل (الضَّآلِّين)، ويُمد ست حركات لزومًا.",
    },
    "madd-lazim-kalimi-mukhaffaf": {
        "en": "Necessary madd (light): a madd letter followed by a permanent sukun in the same word — 6 counts.",
        "ar": "المد اللازم الكلمي المخفف: حرف مد بعده سكون أصلي في كلمة واحدة، ويُمد ست حركات.",
    },
    "madd-badal": {
        "en": "Madd al-badal: a hamza followed by a madd letter (as in ءَامَنُوا) — 2 counts in Hafs.",
        "ar": "مد البدل: همز بعده حرف مد، مثل (ءَامَنُوا)، ويُمد حركتين لحفص.",
    },
    "madd-tabee-kalimi": {
        "en": "Natural madd (al-madd at-tabiʿi): a madd letter with no hamza or sukun after it — 2 counts.",
        "ar": "المد الطبيعي: حرف مد ليس بعده همز ولا سكون، ويُمد حركتين.",
    },
    "noon-mushaddadah": {
        "en": "Nun with shaddah: always pronounced with a full ghunnah of about 2 counts.",
        "ar": "النون المشددة: تُنطق دائمًا بغنة كاملة بمقدار حركتين.",
    },
    "meem-mushaddadah": {
        "en": "Mim with shaddah: always pronounced with a full ghunnah of about 2 counts.",
        "ar": "الميم المشددة: تُنطق دائمًا بغنة كاملة بمقدار حركتين.",
    },
    "idgham-bi-ghunnah-noon": {
        "en": "Idgham with ghunnah: a nun sakinah before ي ن م و (in the next word) merges into it with a ghunnah of about 2 counts.",
        "ar": "الإدغام بغنة: تُدغم النون الساكنة في (ي ن م و) من الكلمة التالية مع غنة بمقدار حركتين.",
    },
    "idgham-bi-ghunnah-tanween": {
        "en": "Idgham with ghunnah: tanwin before ي ن م و merges into it with a ghunnah of about 2 counts.",
        "ar": "الإدغام بغنة: يُدغم التنوين في (ي ن م و) مع غنة بمقدار حركتين.",
    },
    "ikhfa-haqiqi-noon": {
        "en": "Ikhfaʾ: a nun sakinah before one of the 15 ikhfaʾ letters is hidden, keeping a ghunnah of about 2 counts.",
        "ar": "الإخفاء الحقيقي: تُخفى النون الساكنة عند أحد حروف الإخفاء الخمسة عشر مع بقاء الغنة بمقدار حركتين.",
    },
    "ikhfa-haqiqi-tanween": {
        "en": "Ikhfaʾ: tanwin before one of the 15 ikhfaʾ letters is hidden, keeping a ghunnah of about 2 counts.",
        "ar": "الإخفاء الحقيقي: يُخفى التنوين عند أحد حروف الإخفاء الخمسة عشر مع بقاء الغنة بمقدار حركتين.",
    },
    "iqlab-noon": {
        "en": "Iqlab: a nun sakinah before ب becomes a hidden mim with a ghunnah of about 2 counts.",
        "ar": "الإقلاب: تُقلب النون الساكنة عند الباء ميمًا مخفاة مع غنة بمقدار حركتين.",
    },
    "iqlab-tanween": {
        "en": "Iqlab: tanwin before ب becomes a hidden mim with a ghunnah of about 2 counts.",
        "ar": "الإقلاب: يُقلب التنوين عند الباء ميمًا مخفاة مع غنة بمقدار حركتين.",
    },
    "ikhfa-shafawi-meem": {
        "en": "Labial ikhfaʾ: a mim sakinah before ب is hidden with a ghunnah of about 2 counts.",
        "ar": "الإخفاء الشفوي: تُخفى الميم الساكنة عند الباء مع غنة بمقدار حركتين.",
    },
    "idgham-shafawi-meem": {
        "en": "Labial idgham: a mim sakinah before another mim merges into it with a ghunnah of about 2 counts.",
        "ar": "الإدغام الشفوي: تُدغم الميم الساكنة في الميم بعدها مع غنة بمقدار حركتين.",
    },
    "qalqalah-sughra": {
        "en": "Minor qalqalah: ق ط ب ج د with sukun in the middle of a word get a light echoing bounce.",
        "ar": "القلقلة الصغرى: تكون في (ق ط ب ج د) الساكنة وسط الكلمة بنبرة خفيفة.",
    },
    "qalqalah-kubra": {
        "en": "Major qalqalah: when stopping on ق ط ب ج د at the end of an ayah, the bounce is strongest.",
        "ar": "القلقلة الكبرى: عند الوقف على (ق ط ب ج د) في آخر الآية، وتكون أقوى ما تكون.",
    },
}

# Letters whose articulation (makhraj) is commonly confused, with a short correction.
MAKHRAJ = [
    {"letters": "حه", "en": "ح comes from the middle of the throat with a slight rasp; ه comes from the deepest part of the throat as a light breath.",
     "ar": "الحاء من وسط الحلق وفيها بحّة، والهاء من أقصى الحلق بنفَس خفيف."},
    {"letters": "عء", "en": "ع comes from the middle of the throat with the voice flowing; the hamza is a clean stop at the deepest part of the throat.",
     "ar": "العين من وسط الحلق مع جريان الصوت، والهمزة من أقصى الحلق بانحباس الصوت."},
    {"letters": "قك", "en": "ق is articulated with the very back of the tongue against the soft palate and is heavy; ك is slightly further forward and light.",
     "ar": "القاف من أقصى اللسان مع ما يحاذيه من الحنك الأعلى وهي مفخمة، والكاف أسفل منها قليلًا وهي مرققة."},
    {"letters": "ضدظ", "en": "ض comes from the side(s) of the tongue against the upper molars, heavy and prolonged — it is neither د nor ظ.",
     "ar": "الضاد من إحدى حافتي اللسان أو كلتيهما مع الأضراس العليا، مفخمة مستطيلة، وليست دالًا ولا ظاءً."},
    {"letters": "صس", "en": "ص is heavy with the tongue raised; س is light. Both are made with the tip of the tongue near the lower front teeth.",
     "ar": "الصاد مفخمة مع استعلاء اللسان، والسين مرققة، ومخرجهما من طرف اللسان مع ما فوق الثنايا السفلى."},
    {"letters": "طت", "en": "ط is heavy with the tongue pressed up to the palate (itbaq); ت is light. Both are made with the tip of the tongue at the roots of the upper front teeth.",
     "ar": "الطاء مفخمة مطبقة، والتاء مرققة، ومخرجهما من طرف اللسان مع أصول الثنايا العليا."},
    {"letters": "ثذظ", "en": "ث ذ ظ are made with the tip of the tongue against the edges of the upper front teeth; ظ is heavy, ث is whispered.",
     "ar": "الثاء والذال والظاء من طرف اللسان مع أطراف الثنايا العليا، والظاء مفخمة، والثاء مهموسة."},
]


def makhraj_hints(word_text: str) -> list[dict]:
    """Articulation notes relevant to the letters of a word (for unclear/substituted words)."""
    from ..quran import normalize
    w = normalize(word_text).replace("ا", "")
    out = []
    for m in MAKHRAJ:
        if any(ch in w for ch in m["letters"]):
            out.append({"letters": m["letters"], "en": m["en"], "ar": m["ar"]})
    return out[:2]


TEACHER_NOTE = {
    "en": "Automated feedback can miss mistakes and can flag correct recitation. Treat it as practice guidance, and have a qualified teacher (mujawwid) confirm your recitation.",
    "ar": "قد يغفل التقييم الآلي عن أخطاء، وقد ينبّه على تلاوة صحيحة. اعتبره إرشادًا للتدريب، واعرض تلاوتك على معلم متقن مجاز.",
}
