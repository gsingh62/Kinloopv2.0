// pages/waitlist.tsx

export default function WaitlistPage() {
    return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-16">
            <div className="max-w-2xl w-full text-center">
                <h1 className="text-4xl font-bold text-gray-900 mb-4">
                    A Private Hub for Your Family to Plan, Chat, and Stay Close
                </h1>
                <p className="text-lg text-gray-600 mb-8">
                    No more messy group chats, forgotten events, or scattered lists.
                    KinLoop brings everything your family needs into one calm, private space.
                </p>

                <form
                    action="https://formsubmit.co/gayatri.singh60@gmail.com"  // ⬅️ Replace with your email
                    method="POST"
                    className="flex flex-col sm:flex-row gap-3 items-center justify-center"
                >
                    {/* Prevent spam bots */}
                    <input type="hidden" name="_captcha" value="false" />
                    <input type="hidden" name="_next" value="https://kinloop.app/thank-you" />

                    <input
                        type="email"
                        name="email"
                        required
                        placeholder="Enter your email"
                        className="w-full sm:w-auto flex-1 px-4 py-3 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                        type="submit"
                        className="bg-blue-600 text-white px-6 py-3 rounded hover:bg-blue-700 transition"
                    >
                        Join the Waitlist
                    </button>
                </form>

                <ul className="mt-10 text-left text-gray-700 space-y-2 max-w-md mx-auto">
                    <li>✅ Shared calendar & reminders</li>
                    <li>✅ To-do lists & grocery planning</li>
                    <li>✅ Private photo sharing & memory docs</li>
                </ul>

                <p className="mt-12 text-sm text-gray-400">
                    Built by families, for families 🧡
                </p>
            </div>
        </div>
    );
}
