import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Recipes } from '../models/recipes.model';
import { doc, getFirestore, query, updateDoc } from 'firebase/firestore';
import { DocumentReference, addDoc, collection, getDoc, getDocs, where } from '@angular/fire/firestore';
import { Ingredients } from '../models/ingredients.model';
import { getStorage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { PhotosService } from 'src/app/services/photos.service';

@Component({
  selector: 'app-form-recipe',
  templateUrl: './form-recipe.component.html',
  styleUrls: ['./form-recipe.component.scss']
})

export class FormRecipeComponent implements OnInit {
  @Input() mode: string = ''; // 'new' o 'edit'
  @Input() recipeEdit: Recipes = new Recipes;
  @Output() addedSuccessfully = new EventEmitter<boolean>();

  recipeForm!: FormGroup;
  recipe: Recipes = new Recipes();
  ingredients: Ingredients[] = [];

  dificultats: any[] = ['Fàcil', 'Mitjana','Difícil'];
  dificultatTriada: any = null;

  selectedImage: File | null = null;
  imageDownloadURL: string = '';

  constructor(private router: Router, private PhotosService: PhotosService) {}

  ngOnInit(): void { 
    console.log(this.mode);
    this.getIngredients();
    this.dificultatTriada = this.dificultats[0];

    if (this.mode === 'new' && this.recipeEdit === undefined) this.newForm();
    else {
      this.newForm();
      this.patchValuesForm();
    }
  }

  async getIngredients() {
    const db = getFirestore();
    const ingredientsCollection = collection(db, 'ingredients');

    try {
      const querySnapshot = await getDocs(ingredientsCollection);

      this.ingredients = []; // Reinicia l'array per evitar duplicats

      querySnapshot.forEach((doc) => {
        const data = doc.data() as Ingredients;
        this.ingredients.push(data);
      });

      console.log(this.ingredients);
    } catch (error) {
      console.error('Error al obtenir els ingredients:', error);
    }
  }

  async getRecipeByName(recipeName: string) {
    console.log(recipeName);
    const db = getFirestore();
    
    try {
      // Crea una consulta per obtenir la recepta amb el nom proporcionat
      const recipesCollection = collection(db, 'recipes');
      const crida = query(recipesCollection, where('name', '==', recipeName));
      
      const querySnapshot = await getDocs(crida);
  
      if (!querySnapshot.empty) {
        // Si hi ha resultats, agafa la primera recepta (podries gestionar múltiples resultats si és necessari)
        const recipeDoc = querySnapshot.docs[0];
        const recipeData = recipeDoc.data();
        console.log(recipeData);
  
        // Obté els noms dels ingredients mitjançant les referències
        const ingredientPromises = recipeData['ingredients'].map(async (ingredientRef: DocumentReference) => {
          try {
            // Obtenir l'ingredient de la col·lecció "ingredients"
            const ingredientDoc = await getDoc(ingredientRef);
        
            if (ingredientDoc.exists()) {
              return ingredientDoc.data();
            } else {
              console.error("Error: Ingredient no trobat en la col·lecció 'ingredients'", ingredientRef.id);
              return null;
            }
          } catch (error) {
            console.error("Error a l'obtenir l'ingredient", error);
            return null;
          }
        });
        
        // Espera que totes les promeses s'acabin
        const ingredientsData = await Promise.all(ingredientPromises);
        console.log(ingredientsData);
  
        console.log('Ingredients from Firestore:', recipeData['ingredients']);
        console.log('Processed Ingredients Data:', ingredientsData);
  
        // Actualitza el formulari amb les dades dels ingredients
        this.recipeForm.patchValue({
          name: recipeData['name'],
          description: recipeData['description'],
          ingredients: ingredientsData, // Utilitza les dades dels ingredients en lloc de les referències
          dificultatTriada: recipeData['difficulty'],
          time: recipeData['time'],
          image: recipeData['image']
        });
  
        this.imageDownloadURL = this.recipeForm.value['image'];
        console.log(this.recipeForm.value);
        console.log(this.imageDownloadURL);
      } else {
        console.log("No s'ha trobat cap recepta amb aquest nom.");
      }
    } catch (error) {
      console.error("Error a l'obtenir la recepta", error);
    }
  }

  newForm() {
    this.recipeForm = new FormGroup({
      name: new FormControl(null, Validators.required),
      description: new FormControl(null, Validators.required),
      ingredients: new FormControl(null, Validators.required),
      dificultatTriada: new FormControl(null, Validators.required),
      time: new FormControl(null, Validators.required),
      image: new FormControl(null)
    });
  }

  patchValuesForm() {
    if (this.recipeEdit !== undefined) {
      const name = String(this.recipeEdit.name);
      console.log(name);
      this.getRecipeByName(name);
    }
  }

  onSelect(event: any) {
    console.log("foto afegida");
    const file = event.files[0];
    this.selectedImage = file;
  }

  async addRecipe() {

    console.log(this.recipeForm.value["name"]);
    console.log(this.recipeForm.value["description"]);
    console.log(this.recipeForm.value["ingredients"]);
    console.log(this.recipeForm.value["dificultatTriada"]);
    console.log(this.recipeForm.value["time"]);
    console.log(this.selectedImage);

    if (this.recipeForm.valid && this.selectedImage) {
      const formData = this.recipeForm.value;
      const newRecipe = {
        description: formData.description,
        difficulty: formData.dificultatTriada,
        ingredients: formData.ingredients,
        name: formData.name,
        time: formData.time,
        image: ''
      };
      const recipeName = this.recipeForm.value["name"];
      const filePath = `/images/recipes/${recipeName}`;

      // Pugem la imatge al servidor
      this.PhotosService.uploadImage(filePath, this.selectedImage).then((url: string) => {
        // Actualitzem la imatge de la recepta a la nostra aplicació
          newRecipe.image = url;

          const db = getFirestore();
          const recipesCollection = collection(db, 'recipes');
  
          addDoc(recipesCollection, newRecipe)
            .then((docRef) => {
              console.log('Recipe added with ID:', docRef.id);
              this.addedSuccessfully.emit(true);
            })
            .catch((error) => {
              console.error('Error adding recipe:', error);
          });
      });
    } else {
      console.log('Invalid form. Please fill in all required fields and select an image.');
    }
  }

  editRecipe() {
    if (this.recipeForm.valid) {
      const formData = this.recipeForm.value;
  
      // Crea l'objecte amb les dades actualitzades
      const updatedRecipe = {
        description: formData.description,
        difficulty: formData.dificultatTriada,
        ingredients: formData.ingredients,
        time: formData.time,
        image: this.selectedImage ? '' : this.imageDownloadURL // Utilitza la nova imatge o la imatge actual
      };
  
      const db = getFirestore();
  
      // Modifica la consulta per obtenir la recepta pel camp "name" en lloc de l'ID
      const recipesCollection = collection(db, 'recipes');
      const crida = query(recipesCollection, where('name', '==', formData.name));
      
      getDocs(crida)
        .then((querySnapshot) => {
          if (!querySnapshot.empty) {
            // Obtenir la primera recepta trobada (pots gestionar múltiples resultats si és necessari)
            const recipeDoc = querySnapshot.docs[0];
            const recipeRef = doc(db, 'recipes', recipeDoc.id);
  
            // Actualitza la recepta amb les noves dades
            updateDoc(recipeRef, updatedRecipe)
              .then(() => {
                console.log('Recipe updated successfully.');
                this.addedSuccessfully.emit(true);
              })
              .catch((error) => {
                console.error('Error updating recipe:', error);
              });
          } else {
            console.log("No s'ha trobat cap recepta amb aquest nom.");
          }
        })
        .catch((error) => {
          console.error("Error a l'obtenir la recepta", error);
        });
    } else {
      console.log('Invalid form. Please fill in all required fields.');
    }
  }
}
