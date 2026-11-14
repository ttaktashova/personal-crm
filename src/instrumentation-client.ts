import { z } from "zod";

// The pages forbid eval (Content-Security-Policy in next.config.ts). When the form schemas are
// created, Zod tries `new Function` once to parse faster; the browser reports that as a CSP error
// in the console, even though Zod then does without it. jitless skips the try, parsing is the same.
// Next runs this file in the browser before any page code, so before the schemas are created.
z.config({ jitless: true });
