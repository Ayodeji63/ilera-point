import "dotenv/config";
import { enforceRetention } from "../server/dataRetention.js";

const apply = process.argv.includes("--apply");
const report = await enforceRetention({ dryRun: !apply });
console.log(JSON.stringify(report, null, 2));
if (!apply) console.log("Dry run only. Pass --apply after reviewing the counts.");

