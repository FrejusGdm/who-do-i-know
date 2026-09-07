import { OwnerSignIn } from "@/components/owner-sign-in";
export const dynamic = "force-dynamic";
export const metadata = { title: "Private account setup · WhoDoYouKnow", robots: { index: false, follow: false } };
export default function SetupPage() { return <OwnerSignIn setup />; }
