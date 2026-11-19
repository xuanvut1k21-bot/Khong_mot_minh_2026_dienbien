import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

test("sharp converts an approved static raster into bounded WebP",async()=>{
 const png=await sharp({
   create:{width:64,height:32,channels:4,background:{r:30,g:60,b:90,alpha:1}}
 }).png().toBuffer();
 const metadata=await sharp(png,{
   limitInputPixels:5_000_000,animated:false,failOn:"warning"
 }).metadata();
 assert.equal(metadata.format,"png");
 assert.equal(metadata.pages??1,1);
 const result=await sharp(png,{
   limitInputPixels:5_000_000,animated:false,failOn:"warning"
 }).rotate().resize({
   width:32,height:32,fit:"inside",withoutEnlargement:true
 }).webp({quality:84,effort:4}).toBuffer();
 assert.ok(result.length>0&&result.length<10*1024*1024);
 const output=await sharp(result).metadata();
 assert.equal(output.format,"webp");
 assert.ok((output.width??0)<=32 && (output.height??0)<=32);
});
