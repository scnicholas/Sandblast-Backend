'use strict';
const Terms=require('./LingoSentinelProtectedTerms');
const VERSION='nyx.lingosentinel.protectedTermResolver/12.0-placeholders';
function protect(text,termLists=[]){let output=String(text==null?'':text);const lists=Array.isArray(termLists)&&termLists.some(Array.isArray)?termLists:[termLists];const terms=Terms.normalize(lists.flat());const map=[];terms.sort((a,b)=>b.length-a.length).forEach((term,i)=>{const token=`__LS_TERM_${i}_${Buffer.from(term).toString('hex').slice(0,12)}__`;const escaped=term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const rx=new RegExp(escaped,'g');if(rx.test(output)){output=output.replace(rx,token);map.push({token,term});}});return {ok:true,text:output,map,terms};}
function restore(text,map=[]){let output=String(text==null?'':text),missing=[];for(const item of map){if(!output.includes(item.token))missing.push(item.term);output=output.split(item.token).join(item.term);}return {ok:missing.length===0,text:output,missing};}
function resolve(text,termLists=[]){return protect(text,termLists);}
function getHealth(){return {ok:true,service:'LingoSentinelProtectedTermResolver',version:VERSION,placeholderBased:true,exactRestoration:true};}
module.exports=Object.freeze({VERSION,protect,restore,resolve,getHealth});
