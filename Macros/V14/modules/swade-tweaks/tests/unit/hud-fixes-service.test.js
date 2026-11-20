import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installFoundryStubs } from "../helpers/foundry-stubs.js";
import { HUD_FIXES, MLD_ID } from "../../scripts/rules/hud-fixes.js";
import {
  registerHudSettings, refreshHudFixes, isClampRunning, stopPaletteClamp
} from "../../scripts/services/hud-fixes.js";

const cls = (k) => HUD_FIXES.find((f) => f.key === k).cssClass;
const body = () => document.body.classList;

// Observateur factice : le service ne doit pas planter hors navigateur
class FakeObserver { observe() {} disconnect() { this.disconnected = true; } }

function setup(opts) {
  installFoundryStubs(opts);
  globalThis.MutationObserver = FakeObserver;
  globalThis.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 1920, innerHeight: 1080 };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.Hooks.off = () => {};
  stopPaletteClamp();
}

beforeEach(() => setup({ activeModules: [MLD_ID] }));

test("registerHudSettings : un réglage client par correction, coché par défaut", () => {
  registerHudSettings();
  for (const f of HUD_FIXES) {
    const def = game.settings.registered.get(`swade-tweaks.${f.key}`);
    assert.ok(def, `réglage ${f.key} manquant`);
    assert.equal(def.scope, "client");
    assert.equal(def.type, Boolean);
    assert.equal(def.default, true);
    assert.equal(def.config, true);
    assert.equal(def.name, f.name);
  }
});

test("registerHudSettings : MLD inactif → ses réglages masqués", () => {
  setup({ activeModules: [] });
  registerHudSettings();
  assert.equal(game.settings.registered.get("swade-tweaks.fixMldHeight").config, false);
  assert.equal(game.settings.registered.get("swade-tweaks.fixStatusColors").config, true);
});

test("refreshHudFixes : pose les classes des corrections actives", () => {
  registerHudSettings();
  refreshHudFixes();
  for (const f of HUD_FIXES.filter((f) => f.cssClass)) assert.ok(body().contains(f.cssClass), f.key);
});

test("refreshHudFixes : MLD inactif → ses classes absentes", () => {
  setup({ activeModules: [] });
  registerHudSettings();
  refreshHudFixes();
  assert.ok(!body().contains(cls("fixMldHeight")));
  assert.ok(body().contains(cls("fixStatusColors")));
});

test("décocher un réglage retire sa classe immédiatement", async () => {
  registerHudSettings();
  refreshHudFixes();
  await game.settings.set("swade-tweaks", "fixTrackerOpacity", false);
  assert.ok(!body().contains(cls("fixTrackerOpacity")));
  await game.settings.set("swade-tweaks", "fixTrackerOpacity", true);
  assert.ok(body().contains(cls("fixTrackerOpacity")));
});

test("recalage : démarre si coché et que le HUD existe", () => {
  globalThis.document = { ...document, getElementById: (id) => (id === "hud" ? {} : null) };
  registerHudSettings();
  refreshHudFixes();
  assert.equal(isClampRunning(), true);
});

test("recalage : s'arrête quand on le décoche", async () => {
  globalThis.document = { ...document, getElementById: (id) => (id === "hud" ? {} : null) };
  registerHudSettings();
  refreshHudFixes();
  await game.settings.set("swade-tweaks", "fixPaletteClamp", false);
  assert.equal(isClampRunning(), false);
});

test("recalage : pas de HUD → ne démarre pas, sans erreur", () => {
  registerHudSettings();
  refreshHudFixes();
  assert.equal(isClampRunning(), false);
});

test("recalage : relancer ne crée pas de doublon", () => {
  globalThis.document = { ...document, getElementById: (id) => (id === "hud" ? {} : null) };
  let observers = 0;
  globalThis.MutationObserver = class extends FakeObserver { constructor() { super(); observers++; } };
  registerHudSettings();
  refreshHudFixes();
  refreshHudFixes();
  assert.equal(observers, 1);
});
