import React from 'react';

type Props = {
    children: React.ReactNode;
};

type State = {
    hasError: boolean;
    error: any;
};

export default class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: any) {
        return { hasError: true, error };
    }

    componentDidCatch(error: any, errorInfo: any) {
        console.error('Caught by ErrorBoundary:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 text-red-600 font-semibold">
                    <h1>Something went wrong.</h1>
                    <p>{this.state.error?.message || 'Unknown error'}</p>
                </div>
            );
        }

        return this.props.children;
    }
}
