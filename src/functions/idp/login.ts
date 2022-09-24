// Imports global types
import "@twilio-labs/serverless-runtime-types";
// Fetches specific types
import {
  Context,
  ServerlessCallback,
  ServerlessFunctionSignature,
} from "@twilio-labs/serverless-runtime-types/types";

type MyContext = {
  SP_LOGIN_URL: string;
};

export const handler: ServerlessFunctionSignature<MyContext> = async function (
  context: MyContext,
  event,
  callback: ServerlessCallback
) {
  const response = new Twilio.Response();
  try {
    console.log("IDP/LOGIN", event);

    response.appendHeader("location", context.SP_LOGIN_URL);
    response.setStatusCode(302);
  } catch (e) {
    console.error("[FATAL] Redirecting to SP login URL", e);
    response.setBody("Redirecting to SP login URL");
    response.setStatusCode(500);
  }

  return callback(null, response);
};
