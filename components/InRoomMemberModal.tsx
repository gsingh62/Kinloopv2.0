// components/InRoomMemberModal.tsx
import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';

export default function InRoomMemberModal({ roomId, onClose }) {
    const [members, setMembers] = useState<any[]>([]);

    useEffect(() => {
        const fetchMembers = async () => {
            const snapshot = await getDocs(collection(db, 'rooms', roomId, 'members'));
            const memberData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setMembers(memberData);
        };
        fetchMembers();
    }, [roomId]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-md w-11/12 max-w-sm">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-semibold">Room Members</h2>
                    <button onClick={onClose} className="text-gray-600 text-sm">Close</button>
                </div>
                <ul className="space-y-2">
                    {members.map(member => (
                        <li key={member.id} className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center">
                                {(member.name || member.email)?.[0]?.toUpperCase()}
                            </div>
                            <span className="text-sm text-gray-800">{member.name || member.email}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
