/**
 * Activation 7 — InfinityScreen: renders one Twin screen in the Classic pale
 * grammar, with optional Enhanced overlays. Values and change handlers are
 * supplied by the workspace so this component stays presentational.
 *
 * Paired fields (name/phone) encode their two halves in one model value joined
 * by U+001F (unit separator) — an interior detail that never leaves the twin.
 */

import type { TwinElement, TwinNavigation, TwinScreen } from "@/lib/script/twin/twin-model";
import {
  ActionButton,
  ComboField,
  FieldRow,
  GuidancePanel,
  InstructionText,
  ListField,
  NameFieldPair,
  NavigationControl,
  PhoneFieldPair,
  PromptText,
  ReadOnlyField,
  ReviewPanel,
  TextAreaField,
  TextField,
  TwinOverlay,
} from "./twin-components";
import { joinPair, splitPair } from "./twin-pair";

export function InfinityScreen({
  screen,
  visible,
  enhanced,
  values,
  onValue,
  onNavigate,
}: {
  screen: TwinScreen;
  visible: TwinElement[];
  enhanced: boolean;
  values: Record<string, string>;
  onValue: (elementId: string, value: string) => void;
  onNavigate: (navId: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label={`Infinity screen: ${screen.title}`}
      style={{
        background: "#e9e9e2",
        color: "#1c1c1c",
        border: "1px solid #b8b8ad",
        borderRadius: 4,
        padding: "16px 18px",
        fontFamily: '"Segoe UI", Tahoma, sans-serif',
        fontSize: 13,
        maxWidth: 560,
        margin: "0 auto",
        boxShadow: "0 18px 50px -30px rgba(0,0,0,.8)",
      }}
    >
      <div
        style={{
          background: "linear-gradient(#f7f7f2,#dcdcd2)",
          margin: "-16px -18px 14px",
          padding: "8px 14px",
          borderBottom: "1px solid #b8b8ad",
          fontWeight: 700,
          color: "#20303f",
        }}
      >
        {screen.title}
      </div>

      {visible.map((el) => (
        <div key={el.id}>
          {renderElement(el, values, onValue)}
          <TwinOverlay element={el} enhanced={enhanced} />
        </div>
      ))}

      <div style={{ display: "flex", gap: 9, marginTop: 16 }}>
        {screen.navigation.map((nav: TwinNavigation) =>
          /back/i.test(nav.label) ? (
            <NavigationControl
              key={nav.id}
              label={nav.label.replace(/^back$/i, "Back")}
              onClick={() => onNavigate(nav.id)}
            />
          ) : (
            <ActionButton key={nav.id} label={nav.label} onClick={() => onNavigate(nav.id)} />
          ),
        )}
      </div>
    </div>
  );
}

function renderElement(
  el: TwinElement,
  values: Record<string, string>,
  onValue: (elementId: string, value: string) => void,
) {
  const v = values[el.id] ?? "";
  switch (el.type) {
    case "prompt":
      return <PromptText>{el.text ?? el.label}</PromptText>;
    case "instruction":
      return <InstructionText>{el.text ?? el.label}</InstructionText>;
    case "guidance_panel":
      return <GuidancePanel>{el.text ?? el.label}</GuidancePanel>;
    case "review_panel":
      return <ReviewPanel>{el.text ?? el.label}</ReviewPanel>;
    case "textarea":
      return (
        <FieldRow label={el.label}>
          <TextAreaField id={el.id} value={v} onChange={(nv) => onValue(el.id, nv)} />
        </FieldRow>
      );
    case "list":
      return (
        <FieldRow label={el.label}>
          <ListField
            id={el.id}
            value={v}
            options={el.options ?? []}
            onChange={(nv) => onValue(el.id, nv)}
          />
        </FieldRow>
      );
    case "combo":
      return (
        <FieldRow label={el.label}>
          <ComboField
            id={el.id}
            value={v}
            options={el.options ?? []}
            onChange={(nv) => onValue(el.id, nv)}
          />
        </FieldRow>
      );
    case "readonly":
      return (
        <FieldRow label={el.label}>
          <ReadOnlyField value={el.value ?? v} />
        </FieldRow>
      );
    case "name_pair": {
      const [a, b] = splitPair(v);
      return (
        <FieldRow label={el.label}>
          <NameFieldPair
            subLabels={el.subLabels ?? ["First", "Last"]}
            values={[a, b]}
            onChange={(which, nv) =>
              onValue(el.id, which === 0 ? joinPair(nv, b) : joinPair(a, nv))
            }
          />
        </FieldRow>
      );
    }
    case "phone_pair": {
      const [a, b] = splitPair(v);
      return (
        <FieldRow label={el.label}>
          <PhoneFieldPair
            values={[a, b]}
            onChange={(which, nv) =>
              onValue(el.id, which === 0 ? joinPair(nv, b) : joinPair(a, nv))
            }
          />
        </FieldRow>
      );
    }
    case "action":
      return (
        <div style={{ marginTop: 4 }}>
          <ActionButton label={el.label} variant={/save/i.test(el.label) ? "save" : "neutral"} />
        </div>
      );
    case "navigation":
      return null; // navigation elements render in the nav row
    case "text":
    default:
      return (
        <FieldRow label={el.label}>
          <TextField
            id={el.id}
            value={v}
            placeholder={el.label}
            onChange={(nv) => onValue(el.id, nv)}
          />
        </FieldRow>
      );
  }
}
