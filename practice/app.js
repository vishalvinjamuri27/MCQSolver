let bank=[],filtered=[],index=0,topic='All topics',generation=0;
const selections=new Map(),checks=new Map();
const $=id=>document.getElementById(id);
const topics=['All topics','Probability','Statistics','Linear algebra','Calculus','Abstract reasoning'];
function updateScore(){let right=0;for(const result of checks.values())if(result.correct)right++;$('score').textContent=`${right} / ${checks.size}`;}
function render(){
  generation++;
  const q=filtered[index];if(!q)return;
  $('position').textContent=`Question ${String(index+1).padStart(2,'0')} of ${filtered.length}`;
  $('progress').style.width=`${(index+1)/filtered.length*100}%`;
  $('topic').textContent=q.topic;$('difficulty').textContent=q.difficulty;
  $('prompt').textContent=q.question;$('choices').replaceChildren();
  q.choices.forEach((choice,i)=>{
    const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');
    input.type='radio';input.name='practice-answer';input.value=String(i);input.checked=selections.get(q.id)===i;
    text.className='option-text';text.textContent=`${String.fromCharCode(65+i)}. ${choice}`;
    input.addEventListener('change',()=>{selections.set(q.id,i);checks.delete(q.id);$('feedback').hidden=true;$('check').disabled=false;updateScore();});
    label.append(input,text);$('choices').append(label);
  });
  $('feedback').hidden=true;$('error').hidden=true;$('check').disabled=!selections.has(q.id);$('previous').disabled=index===0;$('next').disabled=index===filtered.length-1;
  $('next').textContent=index===filtered.length-1?'End of set':'Next question →';
  for(const button of $('topics').children)button.classList.toggle('active',button.dataset.topic===topic);
  updateScore();
}
for(const name of topics){const button=document.createElement('button');button.dataset.topic=name;const title=document.createElement('span'),count=document.createElement('small');title.textContent=name;count.textContent=name==='All topics'?'20':'04';button.append(title,count);button.addEventListener('click',()=>{topic=name;filtered=bank.filter(q=>name==='All topics'||q.topic===name);index=0;render();});$('topics').append(button);}
$('previous').addEventListener('click',()=>{if(index>0){index--;render();}});
$('next').addEventListener('click',()=>{if(index<filtered.length-1){index++;render();}});
$('check').addEventListener('click',async()=>{
  const q=filtered[index],selection=selections.get(q.id),version=generation;
  if(selection===undefined)return;
  $('check').disabled=true;
  try{
    const response=await fetch('/practice/check',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:q.id,selection})});
    if(!response.ok)throw Error();const result=await response.json();
    if(version!==generation||selections.get(q.id)!==selection)return;
    checks.set(q.id,result);updateScore();
    $('verdict').textContent=`${result.correct?'Correct':'Not quite'} · ${result.label} — ${result.answer}`;
    $('explanation').textContent=result.explanation;$('feedback').hidden=false;
  }catch{if(version===generation){$('error').textContent='Could not check the answer. Make sure the local demo server is running.';$('error').hidden=false;}}
  finally{if(version===generation)$('check').disabled=false;}
});
let remaining=22*60,running=false,last=0;
function clock(){const minutes=Math.floor(remaining/60),seconds=remaining%60;$('timer').textContent=`${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;$('timer-toggle').textContent=running?'Pause timer':remaining===0?'Time finished':'Start timer';}
$('timer-toggle').addEventListener('click',()=>{if(remaining>0){running=!running;last=Date.now();clock();}});
$('timer-reset').addEventListener('click',()=>{running=false;remaining=22*60;clock();});
setInterval(()=>{if(!running)return;const elapsed=Math.floor((Date.now()-last)/1000);if(elapsed>0){remaining=Math.max(0,remaining-elapsed);last+=elapsed*1000;if(!remaining)running=false;clock();}},250);
try{const response=await fetch('/practice/questions');if(!response.ok)throw Error();bank=await response.json();filtered=bank;render();}catch{$('error').textContent='Questions could not load. Restart npm run demo and refresh.';$('error').hidden=false;}
