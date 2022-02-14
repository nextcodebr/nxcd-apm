# object-detection-text-parser
This lib is used to parse the result of and OCR with the result of an inference from a brazilian identity card object detection trained model.
OCR gives us words with respective bounding boxes and the object detection model gives us bounding boxes for each information of and id card, this lib can join and cleanse each word from OCR that is inside each box from object detection.

### Usage

#### FieldExtractorBuilder

```node
import { FieldExtractorBuilder } from '../domain/entities/field-extractor-builder'

import ocrResult from '../../tests/data/rne-text'
import fieldResult from '../../tests/data/rne-fields'

import { ParserBuilder as builder } from '../domain/entities/parser-builder'

const image = { width: 818, height: 920 }

const objects = new FieldExtractorBuilder(0.8)
  .textRecognition(ocrResult)
  .objectDetection({ image, input: fieldResult })
  .build()

console.log(objects)

```

#### ParserBuilder

```node

import { ParserBuilder as builder } from '../domain/entities/parser-builder'

const detected = {
  name: 'Nome John Doe',
  federalRevenueData: '11122233344',
  birthdate: 'Data 1980-01-01 Data filiação'
}

const result = {
  ...builder.of({ fieldName: 'name', fields: detected }).removeLabel('Nome').build(),
  ...builder.of({ fieldName: 'federalRevenueData', fields: detected }).build(),
  ...builder.of({ fieldName: 'birthdate', fields: detected }).removeToken('filiação').removeToken('Data').build(),
  ...builder.of({ fieldName: 'mothersName', fields: detected }).build()
}

console.log(result)

```

