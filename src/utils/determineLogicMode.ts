import type { LogicMode } from '../types/sceneGenerator';

export function determineLogicMode(categories: {
    angle: boolean;
    shot: boolean;
    expression: boolean;
}): LogicMode {
    const selectedCount = Object.values(categories).filter(Boolean).length;

    switch (selectedCount) {
        case 1:
            return 'LINEAR';
        case 2:
            return 'MATRIX';
        case 3:
            return 'DYNAMIC';
        default:
            return 'LINEAR'; // fallback or none
    }
}
