# Evolve AI — Cas d'usage en 1 minute

> Pour le lecteur pressé · FR + EN · Projet : `github.com/mhallihamza/coach`

## Ce que c'est, en une phrase

**Un coach de développement personnel qui refuse de deviner et refuse de flatter — il prouve chaque chose qu'il dit, avec vos propres mots.**

## Le problème

La plupart des gens ambitieux sont bloqués par les mêmes deux murs :

1. **« Je ne sais pas où je vais »** — objectifs vagues, aucun cap mesurable.
2. **« Je connais mes points faibles mais personne ne me les nomme honnêtement. »** — les amis ménagent, les managers évitent, les "coachs" IA génèrent du remplissage sans preuve.

Les outils existants (apps de méditation, trackers d'habitudes, chatbots génériques) donnent soit du contenu passif, soit des réponses plausibles non fondées. Rien n'est mesuré, rien n'est confronté à la réalité du CV, des réponses et du vécu.

## La solution — la boucle Evolve

```
Compte → CV + objectif (optionnel) → Évaluation (18 questions, 4 min)
        → Rapport : score /100, forces, gaps, limites internes/externes
        → Plan 30/60/90 jours — approbation explicite de l'utilisateur
        → Suivi mensuel, ré-évaluation, adaptation du plan
```

**Trois principes non négociables :**

1. **Preuve ou silence.** Chaque affirmation du rapport cite une de vos réponses ou une ligne de votre CV. Pas de preuve → la phrase disparaît.
2. **Zéro diagnostic.** Pas de psychiatrie, pas d'étiquettes. Evolve nomme des hypothèses avec des preuves, il n'en décrète jamais.
3. **L'utilisateur aprouve tout avant que ce soit sauvegardé.** Un goal n'existe que s'il a pressé « Créer mon plan ». Un rapport peut être sauvegardé automatiquement car c'est une mesure, pas un engagement.

## Script 30 secondes

**English**
> "Evolve is a personal-development coach that refuses to flatter you and refuses to guess.
> You upload your CV, state your goal — then answer eighteen honest questions.
> Four minutes later, you get a brutally fair report: your strengths, your gaps, your real limits — every line citing your own words, never invented.
> Then AI builds you a 30-60-90 day plan, one action at a time, and tracks it month after month.
> It's not a chatbot. It's a coach that challenges you — powered by your own data, not generic advice."

**Français**
> « Evolve, c'est un coach de développement personnel qui refuse de vous flatter et refuse de deviner.
> Vous importez votre CV, vous dites votre objectif — puis dix-huit questions honnêtes.
> Quatre minutes plus tard, un rapport objectivement juste : vos forces, vos écarts, vos vraies limites — chaque affirmation citant vos propres mots, jamais inventée.
> Ensuite, l'IA construit votre plan 30/60/90 jours, étape par étape, et le suit mois après mois.
> Ce n'est pas un chatbot. C'est un coach qui vous challenge — avec VOS données, pas des conseils génériques. »

**العربية**
> « إيفولف مدرّب تطوير شخصي يرفض مجاملتك ويرفض التخمين.
> ترفع سيرتك الذاتية، تذكر هدفك — ثم تجيب على ثمانية عشر سؤالاً صادقاً.
> بعد أربع دقائق، تحصل على تقرير عادل تماماً: نقاط قوتك، فجواتك، حدودك الحقيقية — كل جملة مبنية على كلامك أنت، لا مُخيّلة.
> ثم تبني لك الذكاء الاصطناعي خطة ثلاثين وستين وتسعين يوماً، خطوة خطوة، وتتابعها شهراً بعد شهر.
> ليس chatbot. مدرب حقيقي — يتحدىك ببياناتك أنت، لا بنصائح عامة. »

*Delivery : lent, pauses assumées, finir sur « VOS données, pas des conseils génériques. » puis silence.*

## Pour qui

- Jeunes professionnels (22–35 ans) qui ont une ambition mais aucun cap mesurable.
- Profils en transition (analyste financier → data, ingénieur stagnant → leadership, etc.).
- Toute personne capable d'être honnête avec elle-même pendant 4 minutes.

## Ce que le produit couvre (FR / AR / EN)

- **Évaluation Evolve** — hybride : noyau fixe (score comparable mois après mois) + questions personnalisées générées depuis CV × objectif × réponses. Jamais scorées arbitrairement — chaque réponse est la preuve.
- **Rapport** — `/dashboard/rapport` : score /100, forces documentées, gaps avec preuves, limites internes/externes (peur, perfectionnisme, temps, argent…), export PDF.
- **Mon plan** — `/dashboard/plan` : brouillon 30/60/90 construit du rapport (1 goal SMART par gap prioritaire, jalons hebdomadaires calqués sur vos vraies heures dispo), **approbation explicite** avant création des goals.
- **Coach conversationnel** — `/dashboard/chat` : sonde de compétences d'abord (pourquoi, concept, scénario), puis entretien adaptatif, puis livraison du bilan (pas de boucle infinie).
- **Sécurité** — données cloisonnées par utilisateur, consentements granulaires, suppression en un clic, redirection systématique vers un professionnel en cas de détresse sévère.

## Ce qu'il ne faut pas dire dans un pitch

- N'annoncez pas de chiffres non auditables (« 2 300 utilisateurs », « 86 % ») — c'est du marketing actuel, pas des faits mesurés.
- Ne promettez pas de résultat ("vous serez promu") — promettez le processus (mesure → plan → suivi).
- Ne présentez pas Evolve comme un psychologue. Ce n'en est pas un, et il ne prétend jamais l'être.

---

*Statut : utilisation locale (Next.js + FastAPI + LangGraph + MongoDB Atlas). Production = décision délibérée, pas un bouton.*
