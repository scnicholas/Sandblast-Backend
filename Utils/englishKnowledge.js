"use strict";

/**
 * Utils/englishKnowledge.js
 *
 * English Knowledge Layer (v1.0.0)
 * Deterministic, mediator-safe, bounded hint engine.
 *
 * Purpose:
 * - Provide structural + pedagogical hints to Marion/chatEngine
 * - Aligned with english manifest v2.0.0
 * - No raw user text storage
 * - No file IO
 * - No mutation
 *
 * API:
 *   getMarionHints({ features, tokens, queryKey }, ctx?) -> hints
 *   query(...) alias
 *
 * Contract:
 *   {
 *     enabled: true,
 *     queryKey,
 *     focus,
 *     stance,
 *     packs,
 *     principles[],
 *     frameworks[],
 *     guardrails[],
 *     exampleTypes[],
 *     responseCues[],
 *     confidence,
 *     reason
 *   }
 */

const ENGLISH_K_VERSION = "englishKnowledge v1.0.0";

// Manifest-aligned pack names (must match manifest)
const PACK_FILES = Object.freeze({
  curriculum: "eng_curriculum_sequence_v1.json",
  sources: "eng_sources_index_v1.json",
  foundations: "eng_foundations_language_science_v1.json",
  phonology: "eng_phonetics_phonology_v1.json",
  morphology: "eng_morphology_word_formation_v1.json",
  syntax: "eng_syntax_grammar_core_v1.json",
  semantics: "eng_semantics_pragmatics_v1.json",
  corpus: "eng_register_corpus_usage_v1.json",
  writing: "eng_academic_writing_clarity_v1.json",
  eap: "eng_eap_canada_case_studies_v1.json",
  faces: "eng_face_examples_v1.json",
  dialogue: "eng_dialogue_snippets_v1.json"
});

// -------------------------
// helpers (bounded, deterministic)
// -------------------------
function safeStr(x, max = 60) {
  if (x === null || x === undefined) return "";
  const s = String(x);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function uniq(arr, max = 8) {
  const out = [];
  const seen = new Set();
  for (const v of Array.isArray(arr) ? arr : []) {
    const s = safeStr(v, 60);
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

// -------------------------
// classification logic
// -------------------------
function classifyFocus(tokens) {
  const t = tokens || [];

  if (t.includes("phonology") || t.includes("pronunciation"))
    return { focus: "phonology", pack: PACK_FILES.phonology };

  if (t.includes("morphology") || t.includes("word formation"))
    return { focus: "morphology", pack: PACK_FILES.morphology };

  if (t.includes("syntax") || t.includes("grammar"))
    return { focus: "syntax", pack: PACK_FILES.syntax };

  if (t.includes("semantics") || t.includes("pragmatics"))
    return { focus: "semantics_pragmatics", pack: PACK_FILES.semantics };

  if (t.includes("corpus") || t.includes("register"))
    return { focus: "register_usage", pack: PACK_FILES.corpus };

  if (t.includes("academic") || t.includes("writing") || t.includes("clarity"))
    return { focus: "academic_writing", pack: PACK_FILES.writing };

  if (t.includes("eap") || t.includes("case_study"))
    return { focus: "eap_case_studies", pack: PACK_FILES.eap };

  if (t.includes("dialogue"))
    return { focus: "dialogue_modeling", pack: PACK_FILES.dialogue };

  if (t.includes("face"))
    return { focus: "face_examples", pack: PACK_FILES.faces };

  return { focus: "foundations", pack: PACK_FILES.foundations };
}

function derivePrinciples(focus) {
  switch (focus) {
    case "syntax":
      return [
        "phrase_structure",
        "hierarchical_constituency",
        "agreement_features",
        "movement_constraints"
      ];
    case "phonology":
      return [
        "phoneme_inventory",
        "minimal_pairs",
        "stress_patterns",
        "phonological_rules"
      ];
    case "morphology":
      return [
        "derivation_vs_inflection",
        "morpheme_segmentation",
        "productivity",
        "word_class_shift"
      ];
    case "semantics_pragmatics":
      return [
        "reference_and_deixis",
        "implicature",
        "presupposition",
        "speech_acts"
      ];
    case "academic_writing":
      return [
        "thesis_clarity",
        "cohesion_devices",
        "paragraph_unity",
        "audience_awareness"
      ];
    case "register_usage":
      return [
        "spoken_vs_written_register",
        "frequency_patterns",
        "disciplinary_lexis"
      ];
    case "eap_case_studies":
      return [
        "scaffolded_instruction",
        "portfolio_assessment",
        "language_support_models"
      ];
    default:
      return [
        "language_as_system",
        "form_meaning_mapping",
        "descriptive_not_prescriptive"
      ];
  }
}

function deriveFrameworks(focus) {
  switch (focus) {
    case "syntax":
      return ["xbar_theory", "dependency_grammar"];
    case "phonology":
      return ["distinctive_features", "prosodic_hierarchy"];
    case "morphology":
      return ["morphological_tree_model"];
    case "semantics_pragmatics":
      return ["truth_conditions", "gricean_maxims"];
    case "academic_writing":
      return ["imrad_structure", "rhetorical_moves_model"];
    case "eap_case_studies":
      return ["content_based_instruction"];
    default:
      return ["structural_linguistics"];
  }
}

function deriveGuardrails(focus) {
  if (focus === "academic_writing")
    return ["avoid_passive_overuse", "define_terms_early"];
  if (focus === "syntax")
    return ["avoid_rule_without_example"];
  if (focus === "semantics_pragmatics")
    return ["distinguish_semantics_from_pragmatics"];
  return ["no_prescriptive_bias"];
}

function deriveResponseCues(focus) {
  if (focus === "academic_writing")
    return ["use_examples", "offer_revision_model"];
  if (focus === "syntax")
    return ["show_tree_structure", "contrast_examples"];
  if (focus === "phonology")
    return ["include_ipa", "minimal_pair_example"];
  return ["define_term", "provide_example"];
}

// -------------------------
// Main Hint Engine
// -------------------------
function getMarionHints(input = {}, ctx = {}) {
  try {
    const features = input.features || {};
    const tokens = Array.isArray(input.tokens) ? input.tokens : [];
    const queryKey = safeStr(input.queryKey || "", 18);

    const { focus, pack } = classifyFocus(tokens);

    const principles = derivePrinciples(focus);
    const frameworks = deriveFrameworks(focus);
    const guardrails = deriveGuardrails(focus);
    const responseCues = deriveResponseCues(focus);

    return {
      enabled: true,
      queryKey,
      focus,
      stance: "academic_structural",
      packs: {
        primary: pack,
        curriculum: PACK_FILES.curriculum,
        sources: PACK_FILES.sources
      },
      principles: uniq(principles, 8),
      frameworks: uniq(frameworks, 6),
      guardrails: uniq(guardrails, 6),
      exampleTypes: uniq(["worked_example", "contrast_pair", "micro_analysis"], 6),
      responseCues: uniq(responseCues, 6),
      confidence: clamp01(0.75),
      reason: "focus_classified"
    };
  } catch (e) {
    return {
      enabled: false,
      reason: "english_hint_fail"
    };
  }
}

function query(input) {
  return getMarionHints(input);
}

module.exports = {
  ENGLISH_K_VERSION,
  PACK_FILES,
  getMarionHints,
  query
};
