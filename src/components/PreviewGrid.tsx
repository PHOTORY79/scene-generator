import React from 'react';

interface PreviewGridProps {
    imageUrl: string;
    selectedCell: number | null;
    onCellSelect: (index: number) => void;
    aspectRatio?: string; // e.g., "16:9", "1:1", "9:16"
}

// Convert ratio string to CSS aspect-ratio value
function ratioToCss(ratio: string): string {
    if (!ratio || ratio === 'Original') return '1 / 1';
    const [w, h] = ratio.split(':').map(Number);
    return `${w} / ${h}`;
}

export function PreviewGrid({ imageUrl, selectedCell, onCellSelect, aspectRatio = '1:1' }: PreviewGridProps) {
    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Calculate 3x3 grid coordinates
        // Ensure we don't go out of bounds (0-2)
        const col = Math.min(2, Math.floor((x / rect.width) * 3));
        const row = Math.min(2, Math.floor((y / rect.height) * 3));

        const cellIndex = row * 3 + col;
        onCellSelect(cellIndex);
    };

    const cssAspectRatio = ratioToCss(aspectRatio);

    return (
        <div
            className="relative w-full max-w-2xl mx-auto overflow-hidden rounded-lg shadow-2xl border border-gray-700 group cursor-crosshair"
            style={{ aspectRatio: cssAspectRatio }}
            onClick={handleClick}
        >
            <img src={imageUrl} alt="Preview Grid" className="w-full h-full object-cover" />

            {/* Grid Overlay */}
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                {Array.from({ length: 9 }).map((_, index) => (
                    <div
                        key={index}
                        className={`
              relative border border-white/10 transition-all duration-200
              ${selectedCell === index ? 'border-yellow-400 border-4 bg-yellow-400/20 z-10' : 'hover:border-yellow-200 hover:bg-white/5'}
            `}
                    >
                        {/* Cell Number logic for debugging or info if needed */}
                        <span className="absolute top-1 left-1 text-[10px] text-white/50">{index}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

