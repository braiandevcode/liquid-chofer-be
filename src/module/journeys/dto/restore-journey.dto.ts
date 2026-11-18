import { IsBoolean, IsOptional } from "class-validator";

// ESPERA UN BOOLEAN
export class RestoreJourneyDto{
    @IsOptional()
    @IsBoolean({ message: 'Debe ser un boolean'})
    readonly replaceExisting: boolean
}