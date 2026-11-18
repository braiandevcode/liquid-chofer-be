import { FindOperator } from "typeorm";

export interface ICriterion {
    id: string;
    revokedAt: FindOperator<any>;
}