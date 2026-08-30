import { redirect } from "react-router";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  // Send the root URL into the authenticated Shopify app.
  throw redirect(`/app${url.search}`);
};

export default function App() {
  return null;
}