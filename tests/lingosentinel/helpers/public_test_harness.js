"use strict";
const fs = require("fs"); const vm = require("vm"); const path = require("path"); const crypto = require("crypto");
class MemoryStorage { constructor(){this.map=new Map();} getItem(k){return this.map.has(k)?this.map.get(k):null;} setItem(k,v){this.map.set(String(k),String(v));} removeItem(k){this.map.delete(String(k));} clear(){this.map.clear();} }
class FakeElement {
  constructor(tag){this.tagName=String(tag||"div").toUpperCase();this.children=[];this.attributes=new Map();this.hidden=false;this.textContent="";this.value="";this.disabled=false;this.listeners=new Map();this.parentNode=null;}
  setAttribute(k,v){this.attributes.set(String(k),String(v));} getAttribute(k){return this.attributes.has(String(k))?this.attributes.get(String(k)):null;}
  appendChild(node){node.parentNode=this;this.children.push(node);return node;}
  addEventListener(n,fn){if(!this.listeners.has(n))this.listeners.set(n,new Set());this.listeners.get(n).add(fn);} removeEventListener(n,fn){if(this.listeners.has(n))this.listeners.get(n).delete(fn);} dispatchEvent(e){(this.listeners.get(e.type)||[]).forEach(fn=>fn(e));}
  matches(selector){const m=/^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);if(!m)return false;return this.attributes.has(m[1])&&(m[2]===undefined||this.attributes.get(m[1])===m[2]);}
  querySelector(selector){if(this.matches(selector))return this;for(const child of this.children){const found=child.querySelector(selector);if(found)return found;}return null;}
  querySelectorAll(selector){const out=[];if(this.matches(selector))out.push(this);for(const child of this.children)out.push(...child.querySelectorAll(selector));return out;}
}
class FakeDocument { constructor(){this.body=new FakeElement("body");} createElement(tag){return new FakeElement(tag);} querySelector(selector){return this.body.querySelector(selector);} }
function createContext(overrides={}){const listeners=new Map();const context={console,Date,Math,JSON,Map,Set,WeakMap,Promise,Uint8Array,TextEncoder,URL,encodeURIComponent,decodeURIComponent,setTimeout,clearTimeout,crypto:crypto.webcrypto,localStorage:new MemoryStorage(),sessionStorage:new MemoryStorage(),document:new FakeDocument(),CustomEvent:class{constructor(type,init){this.type=type;this.detail=init&&init.detail;}},addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeEventListener(type,fn){if(listeners.has(type))listeners.get(type).delete(fn);},dispatchEvent(event){(listeners.get(event.type)||[]).forEach(fn=>fn(event));return true;},fetch:async()=>({ok:true,status:200,json:async()=>({ok:true})}),module:{exports:{}},exports:{},require};Object.assign(context,overrides);context.window=context;context.globalThis=context;vm.createContext(context);return context;}
function load(context,file){const code=fs.readFileSync(file,"utf8");context.module={exports:{}};context.exports=context.module.exports;vm.runInContext(code,context,{filename:file});return context.module.exports;}
function publicPath(root,name){return path.join(root,"public","lingosentinel",name);}function assert(condition,message){if(!condition)throw new Error(message||"assertion_failed");}
function backendModule(root,name,strict=false){const p=path.join(root,"Data","marion","runtime","LingoSentinel",name+".js");if(!fs.existsSync(p)){if(strict)throw new Error("missing_backend_module:"+name);return null;}return require(p);}
module.exports={MemoryStorage,FakeElement,FakeDocument,createContext,load,publicPath,assert,backendModule};
