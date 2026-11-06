import type { PublicationState } from './publication-display.mjs'
export type EditorialOperation=NonNullable<PublicationState['latestPublication']>&{rebuild:PublicationState['rebuild']}
export function editorialChanges(before:unknown,after:unknown):Array<{path:string;before:unknown;after:unknown}>
export function editorialOperationState(siteId:string,operation:EditorialOperation,global:PublicationState|null):PublicationState
