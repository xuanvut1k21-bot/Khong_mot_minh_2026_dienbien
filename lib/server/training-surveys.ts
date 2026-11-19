import "server-only";
import { trainingRegistrationEnabled } from "@/lib/server/training-security";

export type SurveyLesson=1|9;
export function surveyLesson(value:string):SurveyLesson|null {
  return value==="1"?1:value==="9"?9:null;
}
export function getSurveyConfiguration(lesson:SurveyLesson):URL|null {
  if (!trainingRegistrationEnabled() ||
      process.env.TRAINING_SURVEY_LAUNCH_ENABLED!=="true" ||
      process.env.TRAINING_SURVEY_WEBHOOK_ENABLED!=="true" ||
      (process.env.TRAINING_SURVEY_WEBHOOK_SECRET?.length??0)<32) return null;
  const host=process.env.TRAINING_SURVEY_PROVIDER_HOST?.trim().toLowerCase();
  const raw=process.env[lesson===1?"TRAINING_SURVEY_1_URL":"TRAINING_SURVEY_9_URL"];
  if(!host||!raw||!host.includes(".")||host==="localhost")return null;
  try{
    const url=new URL(raw);
    if(url.protocol!=="https:"||url.hostname!==host ||
      url.username||url.password||url.port||url.search||url.hash ||
      url.pathname==="/"||url.hostname.endsWith(".local"))return null;
    return url;
  }catch{return null;}
}
export function publicSurveyLanding(lesson:SurveyLesson):string|null{
  if(!getSurveyConfiguration(lesson))return null;
  try{
    const app=new URL(process.env.APP_BASE_URL??"");
    if(app.pathname!=="/" || (app.protocol!=="https:" &&
      !(process.env.NODE_ENV!=="production"&&app.protocol==="http:"&&app.hostname==="localhost")))
      return null;
    return new URL("/dao-tao/khao-sat/"+lesson,app.origin).toString();
  }catch{return null;}
}
