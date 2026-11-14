// Banque de questions — Évaluation Evolve (18 questions, ~4 minutes).
// id stables côté backend (q1..q18). Preuves = réponses verbatim utilisateur.

export type Lang = 'fr' | 'ar' | 'en';

export type QType = 'open' | 'mcq' | 'scale';

export interface Question {
  id: string;
  domain: Record<Lang, string>;
  kind: QType;
  text: Record<Lang, string>;
  hint?: Record<Lang, string>;
  options?: Record<Lang, string>[];
}

export const QUESTIONS: Question[] = [
  // ── Direction & intention ──
  {
    id: 'q1', domain: { fr: 'Direction', ar: 'الاتجاه', en: 'Direction' }, kind: 'open',
    text: {
      fr: 'En une phrase — ce que tu veux vraiment accomplir dans les 12 prochains mois.',
      ar: 'بجملة واحدة — ما الذي تريد حقاً إنجازه خلال الـ 12 شهراً القادمة؟',
      en: 'In one sentence — what do you really want to accomplish in the next 12 months?',
    },
    hint: { fr: 'Pas la version polie : la version honnête.', ar: 'ليس النسخة المهذبة — النسخة الصادقة.', en: 'Not the polite version — the honest one.' },
  },
  {
    id: 'q2', domain: { fr: 'Direction', ar: 'الاتجاه', en: 'Direction' }, kind: 'mcq',
    text: { fr: 'Ta cible principale aujourd’hui ?', ar: 'ما هو هدفك الرئيسي اليوم؟', en: 'Your main target right now?' },
    options: [
      { fr: 'A — Transition de carrière : sauter vers un nouveau métier', ar: 'A — تحول مهني: القفز نحو وظيفة جديدة', en: 'A — Career switch: leap into a new role' },
      { fr: 'B — Maîtrise : devenir excellent dans mon rôle actuel', ar: 'B — التميز: أن أصبح ممتازاً في دوري الحالي', en: 'B — Mastery: become excellent in my current role' },
      { fr: 'C — Leadership : grandir en responsabilité et en influence', ar: 'C — القيادة: النمو في المسؤولية والتأثير', en: 'C — Leadership: grow in responsibility and influence' },
      { fr: 'D — Entrepreneuriat : construire quelque chose à moi', ar: 'D — ريادة الأعمال: بناء شيء خاص بي', en: 'D — Entrepreneurship: build something of my own' },
    ],
  },
  {
    id: 'q3', domain: { fr: 'Direction', ar: 'الاتجاه', en: 'Direction' }, kind: 'scale',
    text: { fr: 'À quel point cette cible est-elle CLAIRE pour toi ?', ar: 'إلى أي مدى هدفك هذا واضح بالنسبة لك؟', en: 'How CLEAR is this target for you?' },
    hint: { fr: '1 = vague, je tâtonne · 10 = cristallin', ar: '1 = غامض، أتلمس طريقي · 10 = بلوري تماماً', en: '1 = vague, feeling my way · 10 = crystal clear' },
  },
  // ── Socle & expérience ──
  {
    id: 'q4', domain: { fr: 'Socle', ar: 'القاعدة', en: 'Foundation' }, kind: 'mcq',
    text: { fr: 'Ton socle principal aujourd’hui ?', ar: 'ما هي قاعدتك الأساسية اليوم؟', en: 'Your main foundation today?' },
    options: [
      { fr: 'A — Une formation académique solide', ar: 'A — تكوين أكاديمي متين', en: 'A — A solid academic background' },
      { fr: 'B — Une expérience professionnelle directe', ar: 'B — خبرة مهنية مباشرة', en: 'B — Direct professional experience' },
      { fr: 'C — Un parcours autodidacte', ar: 'C — مسار ذاتي التعلم', en: 'C — A self-taught path' },
      { fr: 'D — Un mix des trois', ar: 'D — مزيج من الثلاثة', en: 'D — A mix of all three' },
    ],
  },
  {
    id: 'q5', domain: { fr: 'Socle', ar: 'القاعدة', en: 'Foundation' }, kind: 'open',
    text: { fr: 'Ta plus grande réussite concrète — un projet, un résultat mesurable.', ar: 'أكبر نجاح ملموس حققته — مشروع أو نتيجة قابلة للقياس.', en: 'Your biggest concrete win — a project, a measurable result.' },
    hint: { fr: 'Un chiffre, une date, un nom : ça parle mieux qu’un adjectif.', ar: 'رقم، تاريخ، اسم — يتحدث أفضل من صفة.', en: 'A number, a date, a name — speaks better than an adjective.' },
  },
  {
    id: 'q6', domain: { fr: 'Socle', ar: 'القاعدة', en: 'Foundation' }, kind: 'scale',
    text: { fr: 'À quel point ton socle actuel te sert la cible ?', ar: 'إلى أي مدى تخدم قاعدتك الحالية هدفك؟', en: 'How much does your current foundation serve the target?' },
    hint: { fr: '1 = presque rien · 10 = exactement ce qu’il faut', ar: '1 = لا شيء تقريباً · 10 = بالضبط ما يلزم', en: '1 = almost nothing · 10 = exactly what’s needed' },
  },
  // ── Forces ──
  {
    id: 'q7', domain: { fr: 'Forces', ar: 'نقاط القوة', en: 'Strengths' }, kind: 'mcq',
    text: { fr: 'Ta force naturelle dominante ?', ar: 'ما هي نقطة قوتك الطبيعية المهيمنة؟', en: 'Your dominant natural strength?' },
    options: [
      { fr: 'A — Analyser et structurer', ar: 'A — التحليل والتنظيم', en: 'A — Analyzing and structuring' },
      { fr: 'B — Interpersonnel — je fais avancer les gens', ar: 'B — العلاقات — أدفع الآخرين للأمام', en: 'B — Interpersonal — I move people forward' },
      { fr: 'C — Créer et innover', ar: 'C — الإبداع والابتكار', en: 'C — Creating and innovating' },
      { fr: 'D — Exécuter et tenir la discipline', ar: 'D — التنفيذ والانضباط', en: 'D — Executing and keeping discipline' },
    ],
  },
  {
    id: 'q8', domain: { fr: 'Forces', ar: 'نقاط القوة', en: 'Strengths' }, kind: 'scale',
    text: { fr: 'À quel point es-tu conscient(e) de tes forces ?', ar: 'إلى أي مدى أنت واعٍ بنقاط قوتك؟', en: 'How aware are you of your strengths?' },
    hint: { fr: '1 = je les découvre encore · 10 = je les nomme sans réfléchir', ar: '1 = مازلت أكتشفها · 10 = أسميها دون تفكير', en: '1 = still discovering them · 10 = I name them instantly' },
  },
  {
    id: 'q9', domain: { fr: 'Forces', ar: 'نقاط القوة', en: 'Strengths' }, kind: 'mcq',
    text: { fr: 'Quel mode d’apprentissage te fait progresser le plus ?', ar: 'أي نمط تعلم يجعلك تتقدم أكثر؟', en: 'Which learning style moves you forward most?' },
    options: [
      { fr: 'A — Un projet pratique, les mains dans le cambouis', ar: 'A — مشروع عملي، اليدين في العمل', en: 'A — A hands-on project' },
      { fr: 'B — Une théorie structurée, étape par étape', ar: 'B — نظرية منظمة خطوة خطوة', en: 'B — Structured theory, step by step' },
      { fr: 'C — Le feedback d’un mentor ou d’un expert', ar: 'C — ملاحظات من مرشد أو خبير', en: 'C — Feedback from a mentor or expert' },
      { fr: 'D — Apprendre en binôme ou en groupe', ar: 'D — التعلم مع شريك أو مجموعة', en: 'D — Learning in a pair or group' },
    ],
  },
  // ── Limites internes ──
  {
    id: 'q10', domain: { fr: 'Limites internes', ar: 'القيود الداخلية', en: 'Inner limits' }, kind: 'scale',
    text: { fr: 'Le perfectionnisme — à quel point ça te PARALYSE ?', ar: 'الكمالية — إلى أي مدى تشلّك؟', en: 'Perfectionism — how much does it PARALYZE you?' },
    hint: { fr: '1 = jamais · 10 = souvent je ne livre pas', ar: '1 = أبداً · 10 = غالباً لا أُسلّم', en: '1 = never · 10 = often I don’t ship' },
  },
  {
    id: 'q11', domain: { fr: 'Limites internes', ar: 'القيود الداخلية', en: 'Inner limits' }, kind: 'mcq',
    text: { fr: 'Face au risque d’échec, tu fonctionnes plutôt…', ar: 'أمام خطر الفشل، كيف تتصرف غالباً؟', en: 'Facing the risk of failure, you tend to…' },
    options: [
      { fr: 'A — J’évite d’agir', ar: 'A — أتجنب التصرف', en: 'A — Avoid acting' },
      { fr: 'B — J’agis, avec peur', ar: 'B — أتصرف رغم الخوف', en: 'B — Act, with fear' },
      { fr: 'C — J’analyse, puis j’agis', ar: 'C — أحلل ثم أتصرف', en: 'C — Analyze, then act' },
      { fr: 'D — Je fonce, l’action d’abord', ar: 'D — أندفع مباشرة، الفعل أولاً', en: 'D — Charge forward, action first' },
    ],
  },
  {
    id: 'q12', domain: { fr: 'Limites internes', ar: 'القيود الداخلية', en: 'Inner limits' }, kind: 'mcq',
    text: { fr: 'Ta limite interne la plus COÛTEUSE ?', ar: 'ما هو قيدك الداخلي الأكثر تكلفة؟', en: 'Your most COSTLY inner limit?' },
    options: [
      { fr: 'A — Procrastination', ar: 'A — التسويف', en: 'A — Procrastination' },
      { fr: 'B — Le doute / syndrome de l’imposteur', ar: 'B — الشك / متلازمة المحتال', en: 'B — Self-doubt / impostor syndrome' },
      { fr: 'C — Surcharge / perfectionnisme', ar: 'C — الإرهاق / الكمالية', en: 'C — Overload / perfectionism' },
      { fr: 'D — Inconstance — des départs forts, des fins difficiles', ar: 'D — عدم الثبات — بدايات قوية ونهايات صعبة', en: 'D — Inconsistency — strong starts, hard endings' },
    ],
  },
  // ── Limites externes ──
  {
    id: 'q13', domain: { fr: 'Limites externes', ar: 'القيود الخارجية', en: 'External limits' }, kind: 'mcq',
    text: { fr: 'Ton frein EXTERNE n°1 ?', ar: 'ما هو عائقك الخارجي رقم 1؟', en: 'Your external blocker #1?' },
    options: [
      { fr: 'A — Le temps — mes journées sont déjà pleines', ar: 'A — الوقت — أيامي ممتلئة أصلاً', en: 'A — Time — my days are already full' },
      { fr: 'B — L’argent — le financement est un frein réel', ar: 'B — المال — تمويل التكوين عائق حقيقي', en: 'B — Money — funding is a real blocker' },
      { fr: 'C — Les obligations familiales', ar: 'C — الالتزامات العائلية', en: 'C — Family obligations' },
      { fr: 'D — L’entourage / le contexte', ar: 'D — المحيط / البيئة المحيطة', en: 'D — My circle / environment' },
    ],
  },
  {
    id: 'q14', domain: { fr: 'Limites externes', ar: 'القيود الخارجية', en: 'External limits' }, kind: 'scale',
    text: { fr: 'Autonomie perçue — à quel point peux-tu décider de ton parcours ?', ar: 'الاستقلالية المتصورة — إلى أي مدى يمكنك تقرير مسارك؟', en: 'Perceived autonomy — how much can you decide your path?' },
    hint: { fr: '1 = tout est décidé pour moi · 10 = je décide de tout', ar: '1 = كل شيء يُقرر لي · 10 = أقرر كل شيء', en: '1 = everything is decided for me · 10 = I decide it all' },
  },
  // ── Engagement & contraintes ──
  {
    id: 'q15', domain: { fr: 'Engagement', ar: 'الالتزام', en: 'Commitment' }, kind: 'mcq',
    text: { fr: 'Réellement, combien d’heures peux-tu libérer par semaine ?', ar: 'واقعياً، كم ساعة يمكنك تخصيصها أسبوعياً؟', en: 'Realistically, how many hours can you free per week?' },
    options: [
      { fr: 'A — Moins de 3 h', ar: 'A — أقل من 3 ساعات', en: 'A — Under 3h' },
      { fr: 'B — 3 à 5 h', ar: 'B — 3 إلى 5 ساعات', en: 'B — 3 to 5h' },
      { fr: 'C — 5 à 10 h', ar: 'C — 5 إلى 10 ساعات', en: 'C — 5 to 10h' },
      { fr: 'D — 10 h et plus', ar: 'D — 10 ساعات فأكثر', en: 'D — 10h+' },
    ],
  },
  {
    id: 'q16', domain: { fr: 'Engagement', ar: 'الالتزام', en: 'Commitment' }, kind: 'mcq',
    text: { fr: 'Ton meilleur rythme de pratique ?', ar: 'ما هو أفضل إيقاع ممارسة بالنسبة لك؟', en: 'Your best practice rhythm?' },
    options: [
      { fr: 'A — 5 min — un rituel minimal mais quotidien', ar: 'A — 5 دقائق — طقس أدنى لكن يومي', en: 'A — 5 min — a minimal but daily ritual' },
      { fr: 'B — 30 min par jour', ar: 'B — 30 دقيقة يومياً', en: 'B — 30 min a day' },
      { fr: 'C — 1 h + par jour', ar: 'C — ساعة أو أكثر يومياً', en: 'C — 1h+ a day' },
      { fr: 'D — Week-end uniquement, en blocs', ar: 'D — عطلة نهاية الأسبوع فقط، على دفعات', en: 'D — Weekends only, in blocks' },
    ],
  },
  // ── Vision & succès ──
  {
    id: 'q17', domain: { fr: 'Succès', ar: 'النجاح', en: 'Success' }, kind: 'open',
    text: { fr: 'Qu’est-ce que « réussir » veut dire pour toi dans 12 mois ?', ar: 'ما يعنيه «النجاح» بالنسبة لك بعد 12 شهراً؟', en: 'What does “succeeding” mean to you in 12 months?' },
    hint: { fr: 'Concret, mesurable, tien.', ar: 'ملموس، قابل للقياس، خاص بك.', en: 'Concrete, measurable, yours.' },
  },
  {
    id: 'q18', domain: { fr: 'Succès', ar: 'النجاح', en: 'Success' }, kind: 'mcq',
    text: { fr: 'Dans 12 mois, qu’est-ce qui ferait que ce parcours serait un succès ?', ar: 'بعد 12 شهراً، ما الذي سيجعل هذه الرحلة نجاحاً بالنسبة لك؟', en: 'In 12 months, what would make this journey a success?' },
    options: [
      { fr: 'A — Un titre et un salaire meilleurs', ar: 'A — منصب وراتب أفضل', en: 'A — A better title and salary' },
      { fr: 'B — Des compétences réelles, prouvées par des livrables', ar: 'B — مهارات حقيقية تثبتها إنجازات', en: 'B — Real skills, proven by deliverables' },
      { fr: 'C — Du sens et de l’impact — utile à quelque chose de plus grand', ar: 'C — معنى وأثر — يفيد شيئاً أكبر', en: 'C — Meaning and impact — serving something bigger' },
      { fr: 'D — Un équilibre vivable + une direction claire', ar: 'D — توازن محتمل + اتجاه واضح', en: 'D — A livable balance + a clear direction' },
    ],
  },
];
