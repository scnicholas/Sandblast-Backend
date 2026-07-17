"use strict";

const express = require("express");
const path = require("path");
const router = express.Router();
const BRIDGE_PATH = path.join(__dirname, "..", "public", "Nyx", "nyx-surface-bridge.js");
const spine = require("../Utils/nyxEcosystemSpine.js");
const {VERSION, readManifest, surfaceName, normalizeContext, transition} = spine;
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

router.get("/manifest", (_req, res) => res.json(readManifest()));
router.post("/context", (req, res) => res.json(normalizeContext(object(req.body), object(req.body).previousState)));
router.post("/transition", (req, res) => { const result = transition(req.body); res.status(result.ok ? 200 : 400).json(result); });
router.get("/bridge.js", (_req, res) => { res.type("application/javascript"); res.set("Cache-Control", "public,max-age=300"); res.sendFile(BRIDGE_PATH); });
router.get("/health", (_req, res) => res.json({ok:true, version:VERSION, manifest:true, bridge:true, publicOnly:true}));

module.exports = router;
module.exports.VERSION = VERSION;
module.exports.readManifest = readManifest;
module.exports.surfaceName = surfaceName;
module.exports.normalizeContext = normalizeContext;
module.exports.transition = transition;
