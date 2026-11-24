import { chromium, devices } from "@playwright/test";

const origin = "https://palkka-pre-retail.pages.dev";
const browser = await chromium.launch({headless:true});
try {
  const context = await browser.newContext({...devices["Pixel 7"],serviceWorkers:"allow"});
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push("PAGE: " + error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push("CONSOLE: " + message.text());
  });
  page.on("requestfailed", req => errors.push("REQUEST: " + req.url() + " " + req.failure()?.errorText));
  for (const url of ["/build-info.json","/experiments/year-planner/index.html","/experiments/year-planner/net-reference-2026.mjs","/experiments/year-planner/ab-summary-v6.mjs"]) {
    try {
      const response = await context.request.get(origin+url);
      const body = await response.text();
      console.log("ASSET",url,response.status(),response.headers()["content-type"],"bytes",body.length,body.slice(0,100).replace(/\\n/g," "));
    } catch(error) { console.log("ASSET-ERROR",url,String(error)); }
  }
  const navigation = await page.goto(origin,{waitUntil:"domcontentloaded",timeout:30000});
  console.log("ROOT",navigation.status(),page.url());
  await page.getByRole("button",{name:"Laskuri",exact:true}).click();
  await page.waitForTimeout(3000);
  const iframe = page.locator("#plannerFrame");
  const frame = await (await iframe.elementHandle()).contentFrame();
  let frameInfo;
  try {
    frameInfo=await frame.evaluate(()=>({href:location.href,title:document.title,ready:document.readyState,hasYear:!!document.getElementById("planYear"),text:document.body?.innerText.slice(0,700)}));
  } catch(error) { frameInfo={error:String(error)}; }
  console.log("IFRAME",JSON.stringify(frameInfo));
  console.log("ERRORS",JSON.stringify(errors));
  await page.screenshot({path:"pre-retail-live-mobile.png",fullPage:false});
  if (!frameInfo.hasYear) {
    throw new Error("Deployed Android viewport planner iframe is not rendering real calculator content");
  }
  await context.close();
} finally {
  await browser.close();
}
