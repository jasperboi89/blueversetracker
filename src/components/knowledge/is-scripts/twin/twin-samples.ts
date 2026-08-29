/**
 * A hand-authored ("MANUAL") Script Twin definition used to demonstrate the
 * Classic/Enhanced views and bounded simulation before a real structured export
 * is available. Activation 7 (STEP 12) explicitly sanctions safe/manual twin
 * definitions to drive progressive reveal — provided nothing claims the
 * behaviour came from Amtelco. Accordingly EVERY element, option, reveal rule
 * and screen here is provenanced honestly: layout/labels are `MANUAL` (a person
 * mapped them), and branch/reveal behaviour is `INFERRED` (a plausible workflow,
 * not verified from a real export). `validatedAgainstRealExport` stays false.
 *
 * This is a labelled demonstration mapping, NOT fabricated intelligence: it does
 * not assert anomalies, forecasts, or facts about any real account.
 */

import { normalizeModel, type TwinScriptModel } from "@/lib/script/twin/twin-model";

export function manualDemoTwin(): TwinScriptModel {
  return normalizeModel({
    scriptId: "demo:patient-intake",
    title: "Patient Intake (manual demo)",
    entryScreenId: "screen:caller",
    validatedAgainstRealExport: false,
    screens: [
      {
        id: "screen:caller",
        title: "Caller",
        provenance: {
          source: "MANUAL",
          evidence: "observed",
          note: "hand-mapped from operator familiarity",
        },
        navigation: [
          {
            id: "nav:caller:next",
            label: "Continue",
            toScreenId: "screen:review",
            provenance: { source: "INFERRED", evidence: "inferred", note: "plausible next screen" },
          },
        ],
        elements: [
          {
            id: "greeting",
            type: "prompt",
            label: "Greeting",
            text: "“Thank you for calling — may I ask who’s calling?”",
            order: 0,
            provenance: { source: "MANUAL", evidence: "observed" },
          },
          {
            id: "guidance",
            type: "instruction",
            label: "Guidance",
            text: "Confirm who is calling and route by caller type before taking details.",
            order: 1,
            provenance: { source: "MANUAL", evidence: "observed" },
          },
          {
            id: "callerType",
            type: "combo",
            label: "Caller type",
            order: 2,
            provenance: {
              source: "MANUAL",
              evidence: "verified",
              note: "known list on this screen",
            },
            options: [
              {
                value: "patient",
                label: "Patient",
                provenance: { source: "MANUAL", evidence: "verified" },
              },
              {
                value: "provider",
                label: "Provider",
                provenance: { source: "MANUAL", evidence: "verified" },
              },
            ],
          },
          {
            id: "callerName",
            type: "name_pair",
            label: "Caller name",
            subLabels: ["First", "Last"],
            order: 3,
            provenance: { source: "MANUAL", evidence: "observed" },
          },
          {
            id: "reason",
            type: "text",
            label: "Reason for call",
            order: 4,
            provenance: { source: "INFERRED", evidence: "inferred" },
            visibility: {
              whenElementId: "callerType",
              equals: ["patient"],
              provenance: {
                source: "INFERRED",
                evidence: "inferred",
                note: "reveal not verified from Amtelco",
              },
            },
          },
          {
            id: "callback",
            type: "phone_pair",
            label: "Callback",
            subLabels: ["Phone", "Ext"],
            order: 5,
            provenance: { source: "INFERRED", evidence: "inferred" },
            visibility: {
              whenElementId: "callerType",
              equals: ["provider"],
              provenance: {
                source: "INFERRED",
                evidence: "inferred",
                note: "reveal not verified from Amtelco",
              },
            },
          },
          {
            id: "spellNote",
            type: "guidance_panel",
            label: "Instruction",
            text: "Confirm spelling of the name and read back the callback number.",
            order: 6,
            provenance: { source: "MANUAL", evidence: "observed" },
          },
        ],
      },
      {
        id: "screen:review",
        title: "Review",
        provenance: { source: "MANUAL", evidence: "observed" },
        navigation: [
          {
            id: "nav:review:back",
            label: "Back",
            toScreenId: "screen:caller",
            provenance: { source: "MANUAL", evidence: "verified" },
          },
        ],
        elements: [
          {
            id: "reviewPanel",
            type: "review_panel",
            label: "Proofread",
            text: "Confirm the caller, reason, and callback details before saving.",
            order: 0,
            provenance: { source: "MANUAL", evidence: "observed" },
          },
          {
            id: "summary",
            type: "readonly",
            label: "Entry summary",
            value: "Populated from the simulated Caller screen.",
            readOnly: true,
            order: 1,
            provenance: { source: "MANUAL", evidence: "observed" },
          },
          {
            id: "save",
            type: "action",
            label: "Save",
            order: 2,
            provenance: {
              source: "MANUAL",
              evidence: "observed",
              note: "sandbox only — never writes to Amtelco",
            },
          },
        ],
      },
    ],
  });
}
