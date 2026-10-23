import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // Purge all offline and online sessions unconditionally for this shop so reinstallation starts clean.
  if (shop) {
    await db.session.deleteMany({ where: { shop } });
  }

  return new Response();
};
