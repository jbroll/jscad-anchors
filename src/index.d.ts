import type { Geom2, Geom3 } from '@jscad/modeling/src/geometries/types'

export * from '@jscad/modeling'

export type Vec3 = [number, number, number]

export interface Frame {
  readonly origin: Readonly<Vec3>
  readonly z: Readonly<Vec3>
  readonly x: Readonly<Vec3>
}

export type Frames = { readonly [name: string]: Frame }
export type Anchorable = Geom2 | Geom3
export type AnchorRef = string | number[]

export interface AttachOptions { overlap?: number, flip?: boolean, spin?: number }
export interface AlignOptions { inset?: number, inside?: boolean }
export interface SubtractOptions { carry?: { [prefix: string]: Anchorable } }
export interface ArrowOptions { length?: number }
export interface Connector { point: number[], axis: number[], normal: number[] }
export type Bosl2Anchor = [string, number[], number[], number?, ...unknown[]]

type Operands<T> = Array<T | T[]>

export interface AnchorsApi {
  (geometry: Anchorable): Frames
  frame(origin: number[], z: number[], x?: number[]): Frame
  withAnchors<T extends Anchorable>(geometry: T, frames: { [name: string]: Frame }): T
  anchor(geometry: Anchorable, ref: AnchorRef): Frame
  attach<T extends Anchorable>(child: T, childAnchor: AnchorRef, parent: Anchorable, parentAnchor: AnchorRef, options?: AttachOptions): T
  alignTo<T extends Anchorable>(child: T, parent: Anchorable, direction: AnchorRef, options?: AlignOptions): T
  unionAnchored<T extends Anchorable>(...geometries: Operands<T>): T
  subtractAnchored<T extends Anchorable>(...args: Array<T | T[] | SubtractOptions>): T
  intersectAnchored<T extends Anchorable>(...geometries: Operands<T>): T
  anchorArrows(geometry: Anchorable, options?: ArrowOptions): Geom3[]
  fromBosl2(anchor: Bosl2Anchor): [string, Frame]
  fromConnector(connector: Connector): Frame
  toConnector(frame: Frame): Connector
}

export declare const anchors: AnchorsApi
