import { useEffect, useState } from 'react';

export function useIsMobileDevice() {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;

        const isPhone = /android|iphone|ipad|ipod|windows phone/i.test(userAgent);
        setIsMobile(isPhone);
    }, []);

    return isMobile;
}
