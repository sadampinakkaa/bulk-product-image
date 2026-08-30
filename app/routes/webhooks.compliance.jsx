import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } =
    await authenticate.webhook(request);

  console.log(
    `Received compliance webhook: ${topic} for ${shop}`
  );

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
      // This app does not store customer data.
      // Shopify customer data is not persisted by this app.
      console.log(
        `Customer data request received for ${shop}`
      );
      break;

    case "CUSTOMERS_REDACT":
      // This app does not store customer data.
      // Nothing needs to be deleted here.
      console.log(
        `Customer redact request received for ${shop}`
      );
      break;

    case "SHOP_REDACT":
      // Remove all stored Shopify sessions for the shop.
      await db.session.deleteMany({
        where: {
          shop,
        },
      });

      console.log(
        `Shop data redacted for ${shop}`
      );
      break;

    default:
      console.log(
        `Unhandled compliance topic: ${topic}`
      );
  }

  return new Response(null, {
    status: 200,
  });
};