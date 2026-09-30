import {readFile} from 'node:fs/promises';
const questions=JSON.parse(await readFile(new URL('../practice/questions.json',import.meta.url),'utf8'));
export function publicQuestions(){return questions.map(({correct,explanation,...question})=>question);}
export function checkAnswer(id,selection){
  const q=questions.find(item=>item.id===id);
  if(!q||!Number.isInteger(selection)||selection<0||selection>=q.choices.length)return null;
  return {correct:selection===q.correct,label:String.fromCharCode(65+q.correct),answer:q.choices[q.correct],explanation:q.explanation};
}
export async function practiceRoute(req,res,path){
  const send=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  if(path==='/practice/questions'){if(req.method!=='GET')send(405,{error:'Method not allowed'});else send(200,publicQuestions());return true;}
  if(path!=='/practice/check')return false;
  if(req.method!=='POST'){send(405,{error:'Use POST'});return true;}
  let body='';
  try{for await(const chunk of req){body+=chunk;if(body.length>2048){send(413,{error:'Too large'});return true;}}
    const {id,selection}=JSON.parse(body);const result=checkAnswer(id,selection);send(result?200:400,result??{error:'Invalid answer selection'});
  }catch{send(400,{error:'Invalid request'});}
  return true;
}
