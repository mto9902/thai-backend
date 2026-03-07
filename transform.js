export default function registerTransformRoute(app, openai) {

  function buildTransformPrompt(grammarRule){
    return `
${grammarRule}

Create a Thai grammar transformation exercise.

STEP 1
Create a base sentence WITHOUT the grammar rule.

STEP 2
Create three new sentences based on that sentence.

Rules:
- One sentence must correctly apply the grammar rule
- Two sentences must contain realistic grammar mistakes
- Reuse the same words from the base sentence whenever possible

Return ONLY JSON:

{
  "base_sentence":{
    "thai":"",
    "romanization":"",
    "english":""
  },
  "options":[
    {"thai":"","romanization":"","english":""},
    {"thai":"","romanization":"","english":""},
    {"thai":"","romanization":"","english":""}
  ],
  "correct_index":0
}
`;
  }

  app.post("/transform", async (req,res)=>{

    try{

      const { prompt } = req.body;

      const aiPrompt = buildTransformPrompt(prompt);

      const response = await openai.chat.completions.create({
        model:"gpt-4o-mini",
        temperature:0.7,
        messages:[{role:"user",content:aiPrompt}]
      });

      let content = response.choices[0].message.content;

      content = content.replace(/```json|```/g,"").trim();

      const data = JSON.parse(content);

      res.json(data);

    }catch(err){

      console.error("Transform error:",err);
      res.status(500).send("Transform generation failed");

    }

  });

}