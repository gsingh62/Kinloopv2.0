// components/DocTab.tsx
import { useMediaQuery } from 'react-responsive';
import dynamic from 'next/dynamic';
import {useIsMobileDevice} from "../utils/isMobileDevice";

const DocTabDesktop = dynamic(() => import('./DocTabDesktop'));
const DocTabMobile = dynamic(() => import('./DocTabMobile'));

export default function DocTabWrapper(props: any) {
    const isMobile = useIsMobileDevice();
    return isMobile ? <DocTabMobile {...props} /> : <DocTabDesktop {...props} />;
}
