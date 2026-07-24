'use strict';

const VERSION = 'nyx.lingosentinel.persistenceAdapter/10.0-memory-adapter';

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

class LingoSentinelMemoryPersistenceAdapter {
  constructor() { this.reset(); }
  reset() {
    this.messages = new Map();
    this.roomMessages = new Map();
    this.highWater = new Map();
    this.states = new Map();
    this.deliveries = new Map();
  }
  appendMessage(message) {
    if (!message || !message.messageId || !message.roomId) return { ok: false, error: 'MESSAGE_INVALID' };
    if (this.messages.has(message.messageId)) return { ok: false, error: 'MESSAGE_ALREADY_EXISTS' };
    const copy = clone(message);
    this.messages.set(copy.messageId, copy);
    const list = this.roomMessages.get(copy.roomId) || [];
    list.push(copy.messageId);
    list.sort((a,b)=>(this.messages.get(a).sequence||0)-(this.messages.get(b).sequence||0));
    this.roomMessages.set(copy.roomId, list);
    if (Number.isSafeInteger(copy.sequence)) this.setHighWater(copy.roomId, copy.sequence);
    return { ok: true, message: clone(copy) };
  }
  replaceMessage(message) {
    if (!message || !this.messages.has(message.messageId)) return { ok: false, error: 'MESSAGE_NOT_FOUND' };
    this.messages.set(message.messageId, clone(message));
    return { ok: true, message: clone(message) };
  }
  getMessage(messageId) { return clone(this.messages.get(String(messageId||'')) || null); }
  listAfter(roomId, sequence, limit) {
    const ids=this.roomMessages.get(String(roomId||''))||[];
    return ids.map(id=>this.messages.get(id)).filter(Boolean).filter(m=>(m.sequence||0)>Number(sequence||0)).slice(0,limit).map(clone);
  }
  listRecent(roomId, limit) {
    const ids=this.roomMessages.get(String(roomId||''))||[];
    return ids.slice(Math.max(0,ids.length-limit)).map(id=>this.messages.get(id)).filter(Boolean).map(clone);
  }
  removeMessage(messageId) {
    const item=this.messages.get(String(messageId||'')); if(!item) return false;
    this.messages.delete(item.messageId);
    const ids=(this.roomMessages.get(item.roomId)||[]).filter(id=>id!==item.messageId);
    if(ids.length) this.roomMessages.set(item.roomId,ids); else this.roomMessages.delete(item.roomId);
    this.states.delete(item.messageId); this.deliveries.delete(item.messageId); return true;
  }
  getHighWater(roomId) { return Number(this.highWater.get(String(roomId||''))||0); }
  setHighWater(roomId, value) { const n=Number(value)||0; if(n>this.getHighWater(roomId)) this.highWater.set(String(roomId||''),n); return this.getHighWater(roomId); }
  setState(messageId, record) { this.states.set(String(messageId||''),clone(record)); return clone(record); }
  getState(messageId) { return clone(this.states.get(String(messageId||''))||null); }
  setDelivery(messageId, record) { this.deliveries.set(String(messageId||''),clone(record)); return clone(record); }
  getDelivery(messageId) { return clone(this.deliveries.get(String(messageId||''))||null); }
  prune(cutoffMs) {
    let removed=0;
    for(const [id,m] of this.messages.entries()) {
      const t=Date.parse(m.publishedAt||m.createdAt||0);
      if(Number.isFinite(t) && t<cutoffMs) { this.removeMessage(id); removed+=1; }
    }
    return removed;
  }
  getHealth() { return { ok:true, service:'LingoSentinelMemoryPersistenceAdapter', version:VERSION, adapter:'memory', messages:this.messages.size, rooms:this.roomMessages.size, restartDurable:false, multiInstanceReady:false }; }
}

const singleton=new LingoSentinelMemoryPersistenceAdapter();
module.exports=singleton;
module.exports.VERSION=VERSION;
module.exports.LingoSentinelMemoryPersistenceAdapter=LingoSentinelMemoryPersistenceAdapter;
