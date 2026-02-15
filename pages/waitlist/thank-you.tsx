// pages/thank-you.tsx

import Link from "next/link";

export default function ThankYouPage() {
    return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-16">
            <div className="max-w-xl w-full text-center">
                <h1 className="text-4xl font-bold text-green-600 mb-4">
                    You're on the list! 🎉
                </h1>
                <p className="text-lg text-gray-700 mb-6">
                    Thanks for joining the KinLoop waitlist. We’ll keep you in the loop as we roll out early access.
                </p>

                <p className="text-md text-gray-600 mb-8">
                    In the meantime, tell your family you signed up — or invite them to join the loop too!
                </p>

                <Link href="/waitlist/waitlist">
                    <a className="text-blue-600 hover:underline">← Back to Waitlist</a>
                </Link>
            </div>
        </div>
    );
}
