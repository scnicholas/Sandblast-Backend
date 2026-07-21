"use strict";
const assert = require("assert");
const bridge = require("../Data/marion/runtime/marionBridge.js");
const intent = require("../Data/marion/runtime/marionIntentRouter.js");
const router = require("../Utils/marionRouter.js");

const hostile = Object.create(null);
hostile.toString = () => ({});
hostile.valueOf = () => ({});

assert.doesNotThrow(() => bridge._internal.jsonSafe(hostile));
assert.doesNotThrow(() => {
  const fn = intent.routeMarionIntent || intent.route || intent.classifyIntent;
  if (typeof fn === "function") fn({ text: "What is 2 + 2?", hostile });
});
assert.doesNotThrow(() => {
  if (typeof router.routeMarion === "function") router.routeMarion({ text: "What is 2 + 2?", hostile });
});
console.log("primitive-conversion contract passed");
