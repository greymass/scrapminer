import type {Action, AssetType, Checksum256Type, NameType, UInt64Type} from '@wharfkit/antelope'
import {ABI, Asset, Blob, Checksum256, Name, Struct, UInt64} from '@wharfkit/antelope'
import type {ActionOptions, ContractArgs, PartialBy, Table} from '@wharfkit/contract'
import {Contract as BaseContract} from '@wharfkit/contract'
export const abiBlob = Blob.from(
    'DmVvc2lvOjphYmkvMS4yAAoHYWNjb3VudAABB2JhbGFuY2UFYXNzZXQFY2xvc2UAAgVvd25lcgRuYW1lBnN5bWJvbAZzeW1ib2wGY3JlYXRlAAIGaXNzdWVyBG5hbWUObWF4aW11bV9zdXBwbHkFYXNzZXQOY3VycmVuY3lfc3RhdHMAAwZzdXBwbHkFYXNzZXQKbWF4X3N1cHBseQVhc3NldAZpc3N1ZXIEbmFtZQVpc3N1ZQADAnRvBG5hbWUIcXVhbnRpdHkFYXNzZXQEbWVtbwZzdHJpbmcHbG9nbWludAAFBW93bmVyBG5hbWUGbWludGVkBWFzc2V0BWVwb2NoBnVpbnQ2NARoYXNoC2NoZWNrc3VtMjU2B3Jlc3VsdHMNbWludF9yZXN1bHRbXQttaW50X3Jlc3VsdAACBHNlZWQGdWludDY0BGhhc2gLY2hlY2tzdW0yNTYEb3BlbgADBW93bmVyBG5hbWUGc3ltYm9sBnN5bWJvbAlyYW1fcGF5ZXIEbmFtZQZyZXRpcmUAAghxdWFudGl0eQVhc3NldARtZW1vBnN0cmluZwh0cmFuc2ZlcgAEBGZyb20EbmFtZQJ0bwRuYW1lCHF1YW50aXR5BWFzc2V0BG1lbW8Gc3RyaW5nBwAAAAAAhWlEBWNsb3Nl7gItLS0Kc3BlY192ZXJzaW9uOiAiMC4yLjAiCnRpdGxlOiBDbG9zZSBUb2tlbiBCYWxhbmNlCnN1bW1hcnk6ICdDbG9zZSB7e25vd3JhcCBvd25lcn194oCZcyB6ZXJvIHF1YW50aXR5IGJhbGFuY2UnCmljb246IEBJQ09OX0JBU0VfVVJMQC9AVE9LRU5fSUNPTl9VUklACi0tLQoKe3tvd25lcn19IGFncmVlcyB0byBjbG9zZSB0aGVpciB6ZXJvIHF1YW50aXR5IGJhbGFuY2UgZm9yIHRoZSB7e3N5bWJvbF90b19zeW1ib2xfY29kZSBzeW1ib2x9fSB0b2tlbi4KClJBTSB3aWxsIGJlIHJlZnVuZGVkIHRvIHRoZSBSQU0gcGF5ZXIgb2YgdGhlIHt7c3ltYm9sX3RvX3N5bWJvbF9jb2RlIHN5bWJvbH19IHRva2VuIGJhbGFuY2UgZm9yIHt7b3duZXJ9fS4AAAAAqGzURQZjcmVhdGWPBC0tLQpzcGVjX3ZlcnNpb246ICIwLjIuMCIKdGl0bGU6IENyZWF0ZSBOZXcgVG9rZW4Kc3VtbWFyeTogJ0NyZWF0ZSBhIG5ldyB0b2tlbicKaWNvbjogQElDT05fQkFTRV9VUkxAL0BUT0tFTl9JQ09OX1VSSUAKLS0tCgp7eyRhY3Rpb24uYWNjb3VudH19IGFncmVlcyB0byBjcmVhdGUgYSBuZXcgdG9rZW4gd2l0aCBzeW1ib2wge3thc3NldF90b19zeW1ib2xfY29kZSBtYXhpbXVtX3N1cHBseX19IHRvIGJlIG1hbmFnZWQgYnkge3tpc3N1ZXJ9fS4KClRoaXMgYWN0aW9uIHdpbGwgbm90IHJlc3VsdCBhbnkgYW55IHRva2VucyBiZWluZyBpc3N1ZWQgaW50byBjaXJjdWxhdGlvbi4KCnt7aXNzdWVyfX0gd2lsbCBiZSBhbGxvd2VkIHRvIGlzc3VlIHRva2VucyBpbnRvIGNpcmN1bGF0aW9uLCB1cCB0byBhIG1heGltdW0gc3VwcGx5IG9mIHt7bWF4aW11bV9zdXBwbHl9fS4KClJBTSB3aWxsIGRlZHVjdGVkIGZyb20ge3skYWN0aW9uLmFjY291bnR9feKAmXMgcmVzb3VyY2VzIHRvIGNyZWF0ZSB0aGUgbmVjZXNzYXJ5IHJlY29yZHMuAAAAAAClMXYFaXNzdWXjBi0tLQpzcGVjX3ZlcnNpb246ICIwLjIuMCIKdGl0bGU6IElzc3VlIFRva2VucyBpbnRvIENpcmN1bGF0aW9uCnN1bW1hcnk6ICdJc3N1ZSB7e25vd3JhcCBxdWFudGl0eX19IGludG8gY2lyY3VsYXRpb24gYW5kIHRyYW5zZmVyIGludG8ge3tub3dyYXAgdG99feKAmXMgYWNjb3VudCcKaWNvbjogQElDT05fQkFTRV9VUkxAL0BUT0tFTl9JQ09OX1VSSUAKLS0tCgpUaGUgdG9rZW4gbWFuYWdlciBhZ3JlZXMgdG8gaXNzdWUge3txdWFudGl0eX19IGludG8gY2lyY3VsYXRpb24sIGFuZCB0cmFuc2ZlciBpdCBpbnRvIHt7dG99feKAmXMgYWNjb3VudC4KCnt7I2lmIG1lbW99fVRoZXJlIGlzIGEgbWVtbyBhdHRhY2hlZCB0byB0aGUgdHJhbnNmZXIgc3RhdGluZzoKe3ttZW1vfX0Ke3svaWZ9fQoKSWYge3t0b319IGRvZXMgbm90IGhhdmUgYSBiYWxhbmNlIGZvciB7e2Fzc2V0X3RvX3N5bWJvbF9jb2RlIHF1YW50aXR5fX0sIG9yIHRoZSB0b2tlbiBtYW5hZ2VyIGRvZXMgbm90IGhhdmUgYSBiYWxhbmNlIGZvciB7e2Fzc2V0X3RvX3N5bWJvbF9jb2RlIHF1YW50aXR5fX0sIHRoZSB0b2tlbiBtYW5hZ2VyIHdpbGwgYmUgZGVzaWduYXRlZCBhcyB0aGUgUkFNIHBheWVyIG9mIHRoZSB7e2Fzc2V0X3RvX3N5bWJvbF9jb2RlIHF1YW50aXR5fX0gdG9rZW4gYmFsYW5jZSBmb3Ige3t0b319LiBBcyBhIHJlc3VsdCwgUkFNIHdpbGwgYmUgZGVkdWN0ZWQgZnJvbSB0aGUgdG9rZW4gbWFuYWdlcuKAmXMgcmVzb3VyY2VzIHRvIGNyZWF0ZSB0aGUgbmVjZXNzYXJ5IHJlY29yZHMuCgpUaGlzIGFjdGlvbiBkb2VzIG5vdCBhbGxvdyB0aGUgdG90YWwgcXVhbnRpdHkgdG8gZXhjZWVkIHRoZSBtYXggYWxsb3dlZCBzdXBwbHkgb2YgdGhlIHRva2VuLgAAACBPJxmNB2xvZ21pbnRnLS0tCnNwZWNfdmVyc2lvbjogIjAuMi4wIgp0aXRsZTogbG9nbWludApzdW1tYXJ5OiBsb2dtaW50Cmljb246IEBJQ09OX0JBU0VfVVJMQC9AVFJBTlNGRVJfSUNPTl9VUklACi0tLQAAAAAAMFWlBG9wZW67BC0tLQpzcGVjX3ZlcnNpb246ICIwLjIuMCIKdGl0bGU6IE9wZW4gVG9rZW4gQmFsYW5jZQpzdW1tYXJ5OiAnT3BlbiBhIHplcm8gcXVhbnRpdHkgYmFsYW5jZSBmb3Ige3tub3dyYXAgb3duZXJ9fScKaWNvbjogQElDT05fQkFTRV9VUkxAL0BUT0tFTl9JQ09OX1VSSUAKLS0tCgp7e3JhbV9wYXllcn19IGFncmVlcyB0byBlc3RhYmxpc2ggYSB6ZXJvIHF1YW50aXR5IGJhbGFuY2UgZm9yIHt7b3duZXJ9fSBmb3IgdGhlIHt7c3ltYm9sX3RvX3N5bWJvbF9jb2RlIHN5bWJvbH19IHRva2VuLgoKSWYge3tvd25lcn19IGRvZXMgbm90IGhhdmUgYSBiYWxhbmNlIGZvciB7e3N5bWJvbF90b19zeW1ib2xfY29kZSBzeW1ib2x9fSwge3tyYW1fcGF5ZXJ9fSB3aWxsIGJlIGRlc2lnbmF0ZWQgYXMgdGhlIFJBTSBwYXllciBvZiB0aGUge3tzeW1ib2xfdG9fc3ltYm9sX2NvZGUgc3ltYm9sfX0gdG9rZW4gYmFsYW5jZSBmb3Ige3tvd25lcn19LiBBcyBhIHJlc3VsdCwgUkFNIHdpbGwgYmUgZGVkdWN0ZWQgZnJvbSB7e3JhbV9wYXllcn194oCZcyByZXNvdXJjZXMgdG8gY3JlYXRlIHRoZSBuZWNlc3NhcnkgcmVjb3Jkcy4AAAAAqOuyugZyZXRpcmXRAi0tLQpzcGVjX3ZlcnNpb246ICIwLjIuMCIKdGl0bGU6IFJlbW92ZSBUb2tlbnMgZnJvbSBDaXJjdWxhdGlvbgpzdW1tYXJ5OiAnUmVtb3ZlIHt7bm93cmFwIHF1YW50aXR5fX0gZnJvbSBjaXJjdWxhdGlvbicKaWNvbjogQElDT05fQkFTRV9VUkxAL0BUT0tFTl9JQ09OX1VSSUAKLS0tCgpUaGUgdG9rZW4gbWFuYWdlciBhZ3JlZXMgdG8gcmVtb3ZlIHt7cXVhbnRpdHl9fSBmcm9tIGNpcmN1bGF0aW9uLCB0YWtlbiBmcm9tIHRoZWlyIG93biBhY2NvdW50LgoKe3sjaWYgbWVtb319IFRoZXJlIGlzIGEgbWVtbyBhdHRhY2hlZCB0byB0aGUgYWN0aW9uIHN0YXRpbmc6Cnt7bWVtb319Cnt7L2lmfX0AAABXLTzNzQh0cmFuc2ZlcqsGLS0tCnNwZWNfdmVyc2lvbjogIjAuMi4wIgp0aXRsZTogVHJhbnNmZXIgVG9rZW5zCnN1bW1hcnk6ICdTZW5kIHt7bm93cmFwIHF1YW50aXR5fX0gZnJvbSB7e25vd3JhcCBmcm9tfX0gdG8ge3tub3dyYXAgdG99fScKaWNvbjogQElDT05fQkFTRV9VUkxAL0BUUkFOU0ZFUl9JQ09OX1VSSUAKLS0tCgp7e2Zyb219fSBhZ3JlZXMgdG8gc2VuZCB7e3F1YW50aXR5fX0gdG8ge3t0b319LgoKe3sjaWYgbWVtb319VGhlcmUgaXMgYSBtZW1vIGF0dGFjaGVkIHRvIHRoZSB0cmFuc2ZlciBzdGF0aW5nOgp7e21lbW99fQp7ey9pZn19CgpJZiB7e2Zyb219fSBpcyBub3QgYWxyZWFkeSB0aGUgUkFNIHBheWVyIG9mIHRoZWlyIHt7YXNzZXRfdG9fc3ltYm9sX2NvZGUgcXVhbnRpdHl9fSB0b2tlbiBiYWxhbmNlLCB7e2Zyb219fSB3aWxsIGJlIGRlc2lnbmF0ZWQgYXMgc3VjaC4gQXMgYSByZXN1bHQsIFJBTSB3aWxsIGJlIGRlZHVjdGVkIGZyb20ge3tmcm9tfX3igJlzIHJlc291cmNlcyB0byByZWZ1bmQgdGhlIG9yaWdpbmFsIFJBTSBwYXllci4KCklmIHt7dG99fSBkb2VzIG5vdCBoYXZlIGEgYmFsYW5jZSBmb3Ige3thc3NldF90b19zeW1ib2xfY29kZSBxdWFudGl0eX19LCB7e2Zyb219fSB3aWxsIGJlIGRlc2lnbmF0ZWQgYXMgdGhlIFJBTSBwYXllciBvZiB0aGUge3thc3NldF90b19zeW1ib2xfY29kZSBxdWFudGl0eX19IHRva2VuIGJhbGFuY2UgZm9yIHt7dG99fS4gQXMgYSByZXN1bHQsIFJBTSB3aWxsIGJlIGRlZHVjdGVkIGZyb20ge3tmcm9tfX3igJlzIHJlc291cmNlcyB0byBjcmVhdGUgdGhlIG5lY2Vzc2FyeSByZWNvcmRzLgIAAAA4T00RMgNpNjQAAAdhY2NvdW50AAAAAACQTcYDaTY0AAAOY3VycmVuY3lfc3RhdHMBBVNDUkFQBVNDUkFQAAAAAA=='
)
export const abi = ABI.from(abiBlob)
export namespace Types {
    @Struct.type('account')
    export class account extends Struct {
        @Struct.field(Asset)
        declare balance: Asset
    }
    @Struct.type('close')
    export class close extends Struct {
        @Struct.field(Name)
        declare owner: Name
        @Struct.field(Asset.Symbol)
        declare symbol: Asset.Symbol
    }
    @Struct.type('create')
    export class create extends Struct {
        @Struct.field(Name)
        declare issuer: Name
        @Struct.field(Asset)
        declare maximum_supply: Asset
    }
    @Struct.type('currency_stats')
    export class currency_stats extends Struct {
        @Struct.field(Asset)
        declare supply: Asset
        @Struct.field(Asset)
        declare max_supply: Asset
        @Struct.field(Name)
        declare issuer: Name
    }
    @Struct.type('issue')
    export class issue extends Struct {
        @Struct.field(Name)
        declare to: Name
        @Struct.field(Asset)
        declare quantity: Asset
        @Struct.field('string')
        declare memo: string
    }
    @Struct.type('mint_result')
    export class mint_result extends Struct {
        @Struct.field(UInt64)
        declare seed: UInt64
        @Struct.field(Checksum256)
        declare hash: Checksum256
    }
    @Struct.type('logmint')
    export class logmint extends Struct {
        @Struct.field(Name)
        declare owner: Name
        @Struct.field(Asset)
        declare minted: Asset
        @Struct.field(UInt64)
        declare epoch: UInt64
        @Struct.field(Checksum256)
        declare hash: Checksum256
        @Struct.field(mint_result, {array: true})
        declare results: mint_result[]
    }
    @Struct.type('open')
    export class open extends Struct {
        @Struct.field(Name)
        declare owner: Name
        @Struct.field(Asset.Symbol)
        declare symbol: Asset.Symbol
        @Struct.field(Name)
        declare ram_payer: Name
    }
    @Struct.type('retire')
    export class retire extends Struct {
        @Struct.field(Asset)
        declare quantity: Asset
        @Struct.field('string')
        declare memo: string
    }
    @Struct.type('transfer')
    export class transfer extends Struct {
        @Struct.field(Name)
        declare from: Name
        @Struct.field(Name)
        declare to: Name
        @Struct.field(Asset)
        declare quantity: Asset
        @Struct.field('string')
        declare memo: string
    }
}
export const TableMap = {
    accounts: Types.account,
    stat: Types.currency_stats,
}
export interface TableTypes {
    accounts: Types.account
    stat: Types.currency_stats
}
export type RowType<T> = T extends keyof TableTypes ? TableTypes[T] : any
export type TableNames = keyof TableTypes
export namespace ActionParams {
    export namespace Type {
        export interface mint_result {
            seed: UInt64Type
            hash: Checksum256Type
        }
    }
    export interface close {
        owner: NameType
        symbol: Asset.SymbolType
    }
    export interface create {
        issuer: NameType
        maximum_supply: AssetType
    }
    export interface issue {
        to: NameType
        quantity: AssetType
        memo: string
    }
    export interface logmint {
        owner: NameType
        minted: AssetType
        epoch: UInt64Type
        hash: Checksum256Type
        results: Type.mint_result[]
    }
    export interface open {
        owner: NameType
        symbol: Asset.SymbolType
        ram_payer: NameType
    }
    export interface retire {
        quantity: AssetType
        memo: string
    }
    export interface transfer {
        from: NameType
        to: NameType
        quantity: AssetType
        memo: string
    }
}
export interface ActionNameParams {
    close: ActionParams.close
    create: ActionParams.create
    issue: ActionParams.issue
    logmint: ActionParams.logmint
    open: ActionParams.open
    retire: ActionParams.retire
    transfer: ActionParams.transfer
}
export type ActionNames = keyof ActionNameParams
export class Contract extends BaseContract {
    constructor(args: PartialBy<ContractArgs, 'abi' | 'account'>) {
        super({
            client: args.client,
            abi: abi,
            account: args.account || Name.from('scrap'),
        })
    }
    action<T extends ActionNames>(
        name: T,
        data: ActionNameParams[T],
        options?: ActionOptions
    ): Action {
        return super.action(name, data, options)
    }
    table<T extends TableNames>(name: T, scope?: NameType): Table<RowType<T>> {
        return super.table(name, scope, TableMap[name])
    }
}
